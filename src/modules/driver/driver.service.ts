import { Injectable, NotFoundException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DriverGateway } from './driver.gateway';
import { UploadDocumentDto, DocumentType } from './dto/upload-document.dto';
import { LocationService } from './location.service';
import { AssignmentsService } from './assignments.service';
import { FirebaseService } from '../../firebase/firebase.service';
import { ConsumerGateway } from '../consumer-gateway/consumer.gateway';

@Injectable()
export class DriverService {
  constructor(
    private prisma: PrismaService,
    private locationService: LocationService,
    private driverGateway: DriverGateway,
    @Inject(forwardRef(() => AssignmentsService))
    private assignmentsService: AssignmentsService,
    private firebaseService: FirebaseService,
    private consumerGateway: ConsumerGateway,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        driver: {
          include: {
            vehicles: true,
          },
        },
        wallet: true,
      },
    });

    if (!user || !user.driver) {
      throw new NotFoundException('Driver profile not found');
    }

    // Surface the admin-configured minimum balance so the app can warn the
    // driver and auto-offline them when their wallet falls below it.
    const minBalanceSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'driver_minimum_balance' },
    });
    const minimumBalance = minBalanceSetting
      ? Number(minBalanceSetting.value)
      : 0;

    // Fire-and-forget: send a single push reminder per day for any
    // expiry-bearing document that's within 5 days of expiring (or already
    // expired). We dedupe per-user using the Notification table so the
    // driver isn't spammed across multiple profile fetches.
    this.maybeSendDocumentExpiryReminder(userId).catch((e) =>
      console.error('document expiry reminder failed:', e),
    );

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatar: user.avatar,
      driver: user.driver,
      wallet: user.wallet,
      isOnline: user.driver.isOnline,
      minimumBalance,
    };
  }

  /// Sends a reminder push when a document is expiring in ≤ 5 days OR
  /// already expired. Deduped: one push per (userId, docType, day).
  private async maybeSendDocumentExpiryReminder(userId: string) {
    const watchedTypes = [
      'LICENSE',
      'NATIONAL_ID',
      'VEHICLE_REG',
      'INSURANCE',
    ];

    const docs = await this.prisma.document.findMany({
      where: {
        userId,
        type: { in: watchedTypes as any },
        status: 'APPROVED',
        expiresAt: { not: null },
      },
    });

    if (docs.length === 0) return;

    const now = Date.now();
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

    // Build the set of docs that are either expired or within 5 days
    const flagged = docs.filter((d) => {
      if (!d.expiresAt) return false;
      const diff = new Date(d.expiresAt).getTime() - now;
      return diff <= fiveDaysMs; // includes negative (already expired)
    });

    if (flagged.length === 0) return;

    // Have we pushed in the last 24 hours? Look in Notification.
    const since = new Date(now - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.notification.findFirst({
      where: {
        userId,
        type: 'SYSTEM',
        actionData: 'DOC_EXPIRY',
        createdAt: { gte: since },
      },
    });
    if (recent) return;

    // Build a friendly Arabic message
    const labelFor = (t: string) => {
      switch (t) {
        case 'LICENSE':
          return 'رخصة القيادة';
        case 'NATIONAL_ID':
          return 'الهوية الوطنية';
        case 'VEHICLE_REG':
          return 'استمارة المركبة';
        case 'INSURANCE':
          return 'التأمين';
        default:
          return t;
      }
    };

    const expired = flagged.filter(
      (d) => new Date(d.expiresAt!).getTime() < now,
    );
    const soon = flagged.filter(
      (d) => new Date(d.expiresAt!).getTime() >= now,
    );

    const titleAr =
      expired.length > 0
        ? 'مستندات منتهية الصلاحية'
        : 'تذكير بتجديد المستندات';

    let bodyAr: string;
    if (expired.length > 0) {
      const names = expired.map((d) => labelFor(d.type)).join('، ');
      bodyAr =
        `انتهت صلاحية ${names}. لا يمكنك العمل حتى تجدّدها من شاشة المستندات.`;
    } else {
      const parts = soon.map((d) => {
        const days = Math.max(
          0,
          Math.ceil(
            (new Date(d.expiresAt!).getTime() - now) /
              (24 * 60 * 60 * 1000),
          ),
        );
        return `${labelFor(d.type)} (${days} يوم)`;
      });
      bodyAr = `قم بتجديد: ${parts.join('، ')} قبل أن تنتهي صلاحيتها.`;
    }

    // Persist + push
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: 'SYSTEM',
        titleAr,
        bodyAr,
        actionType: 'NONE',
        actionData: 'DOC_EXPIRY',
        sentVia: 'PUSH',
        isSent: true,
      },
    });

    // Push via FCM if we have a token
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });
    if (user?.fcmToken) {
      try {
        await this.firebaseService.sendNotification(
          user.fcmToken,
          titleAr,
          bodyAr,
          {
            type: 'DOC_EXPIRY',
            notificationId: notification.id,
          },
        );
      } catch (e) {
        console.error('FCM doc expiry push failed:', e);
      }
    }
  }

  async updateLocation(userId: string, latitude: number, longitude: number) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update location in database (no Redis needed)
    await this.locationService.updateDriverLocation(userId, latitude, longitude);

    // If the driver is on an HOURLY ride that's IN_PROGRESS, accumulate
    // the meter using this sample. Best-effort — failure here must not
    // break the location ping.
    try {
      const activeRide = await this.prisma.ride.findFirst({
        where: {
          driverId: driver.id,
          status: 'IN_PROGRESS',
          rideType: 'HOURLY',
        },
        select: { id: true },
      });
      if (activeRide) {
        await this.accumulateHourlyMeter(activeRide.id, latitude, longitude);
      }
    } catch (e) {
      console.error('Hourly meter accumulate failed:', e);
    }

    // Broadcast the location to any rider waiting on this driver. We
    // only push when the driver is on an active (non-terminal) ride to
    // avoid spamming sockets while the driver is just cruising.
    try {
      const liveRide = await this.prisma.ride.findFirst({
        where: {
          driverId: driver.id,
          status: {
            in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'],
          },
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      if (liveRide) {
        this.consumerGateway.emitDriverLocation(liveRide.id, {
          lat: latitude,
          lng: longitude,
          heading: driver.heading != null ? Number(driver.heading) : null,
        });
      }
    } catch (e) {
      // Non-fatal — location persisted, just no live push.
      console.error('Consumer location broadcast failed:', e);
    }

    return { success: true };
  }

  /// Apply a new GPS sample to the running hourly meter:
  ///   • Compute time delta and distance delta since the last sample.
  ///   • If average speed ≥ movingThreshold → bill the segment as distance.
  ///   • Otherwise → bill the time delta as idle minutes.
  /// Updates the HourlyRide row's running counters and total fare.
  private async accumulateHourlyMeter(
    rideId: string,
    lat: number,
    lng: number,
  ) {
    const hourly = await this.prisma.hourlyRide.findUnique({
      where: { rideId },
    });
    if (!hourly || !hourly.startedAt || hourly.endedAt) return;

    const now = new Date();
    const lastAt = hourly.lastSampleAt ?? hourly.startedAt;
    const elapsedSeconds = Math.max(
      0,
      Math.floor((now.getTime() - lastAt.getTime()) / 1000),
    );
    if (elapsedSeconds <= 0) {
      // No-op sample, just stamp the position so we have a baseline.
      await this.prisma.hourlyRide.update({
        where: { rideId },
        data: {
          lastSampleAt: now,
          lastLat: lat as any,
          lastLng: lng as any,
        },
      });
      return;
    }
    // Cap any single segment at 5 minutes — protects against bad timestamps
    // (e.g. driver app went to sleep and resumed) inflating idle time.
    const cappedSeconds = Math.min(elapsedSeconds, 5 * 60);

    let segmentKm = 0;
    if (hourly.lastLat != null && hourly.lastLng != null) {
      segmentKm = haversineKm(
        Number(hourly.lastLat),
        Number(hourly.lastLng),
        lat,
        lng,
      );
    }
    const speedKmh = cappedSeconds > 0
      ? (segmentKm / (cappedSeconds / 3600))
      : 0;
    // Reject obvious GPS jumps. A taxi can't physically be doing more
    // than ~120 km/h, so anything beyond that is almost certainly a bad
    // fix (urban canyon, indoors, cold start). Bill the segment as
    // idle time but don't credit the phantom kilometers.
    const jumpDetected = speedKmh > 120;
    const threshold = Number(hourly.movingThresholdKmh) || 5;

    let addIdleSeconds = 0;
    let addMovingKm = 0;
    let addCharge = 0;

    if (!jumpDetected && speedKmh >= threshold && segmentKm > 0) {
      // Driving — bill by distance.
      const perKm =
        hourly.pricePerKm != null ? Number(hourly.pricePerKm) : 0;
      addMovingKm = segmentKm;
      addCharge = perKm * segmentKm;
    } else {
      // Stopped, crawling, or GPS jump — bill by time only.
      const perMinute = Number(hourly.pricePerHour) / 60;
      addIdleSeconds = cappedSeconds;
      addCharge = perMinute * (cappedSeconds / 60);
    }

    // Don't keep accumulating fare past balance + 50 MRU debt. The
    // movingKm and idleSeconds counters still advance (so we have the
    // distance/time record) but the runningTotal stops climbing.
    try {
      const ride = await this.prisma.ride.findUnique({
        where: { id: rideId },
        select: {
          driverId: true,
          vehicleTypeId: true,
        },
      });
      if (ride?.driverId && ride.vehicleTypeId) {
        const driver = await this.prisma.driver.findUnique({
          where: { id: ride.driverId },
          include: { user: { include: { wallet: true } } },
        });
        const vt = await this.prisma.vehicleType.findUnique({
          where: { id: ride.vehicleTypeId },
          select: { adminCommission: true },
        });
        if (driver && vt) {
          const adminPct = Number(vt.adminCommission);
          const balance = driver.user.wallet
            ? Number(driver.user.wallet.balance)
            : 0;
          const projectedTotal = Number(hourly.runningTotal) + addCharge;
          const projectedCommission = projectedTotal * (adminPct / 100);
          if (projectedCommission > balance + 50) {
            addCharge = 0;
          }
        }
      }
    } catch {/* best effort */}

    await this.prisma.hourlyRide.update({
      where: { rideId },
      data: {
        idleSeconds: { increment: addIdleSeconds },
        movingKm: { increment: addMovingKm } as any,
        runningTotal: { increment: addCharge } as any,
        lastSampleAt: now,
        lastLat: lat as any,
        lastLng: lng as any,
      },
    });
  }

  async toggleAvailability(userId: string, isOnline: boolean) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: {
        user: {
          include: {
            wallet: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Check if driver is trying to go offline while on a trip
    if (!isOnline && driver.isOnTrip) {
      throw new BadRequestException('Cannot go offline while on a trip');
    }

    // If trying to go online, perform validation checks
    if (isOnline) {
      // 1. Check driver status - must be APPROVED
      if (driver.status !== 'APPROVED') {
        const statusMessages = {
          PENDING: 'Your account is pending approval',
          SUSPENDED: 'Your account has been suspended',
          REJECTED: 'Your account has been rejected',
          INACTIVE: 'Your account is inactive',
        };
        throw new BadRequestException(
          statusMessages[driver.status] || 'Your account is not approved',
        );
      }

      // 2. Check wallet balance against minimum requirement
      const minBalanceSetting = await this.prisma.systemSetting.findUnique({
        where: { key: 'driver_minimum_balance' },
      });

      const minimumBalance = minBalanceSetting 
        ? Number(minBalanceSetting.value) 
        : 0;

      const wallet = driver.user.wallet;
      if (!wallet || Number(wallet.balance) < minimumBalance) {
        throw new BadRequestException(
          `Insufficient balance. Minimum required: ${minimumBalance} MRU`,
        );
      }

      // 3. Check if driver has completed required documents
      const requiredDocs = await this.prisma.document.findMany({
        where: {
          userId,
          type: {
            in: ['LICENSE', 'NATIONAL_ID', 'NATIONAL_ID_BACK', 'VEHICLE_REG', 'INSURANCE'],
          },
        },
      });

      const approvedDocs = requiredDocs.filter(doc => doc.status === 'APPROVED');
      if (approvedDocs.length < 5) {
        throw new BadRequestException(
          'Please complete and get approval for all required documents',
        );
      }

      // 4. Check for expired documents — only flag docs that EXPIRED
      // BEFORE the start of today (so a doc that says "expires today" is
      // still valid for the rest of the day).
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const expiredDocs = approvedDocs.filter(
        (doc) => doc.expiresAt && new Date(doc.expiresAt) < startOfToday,
      );
      if (expiredDocs.length > 0) {
        const labelFor = (t: string) => {
          switch (t) {
            case 'LICENSE':
              return 'رخصة القيادة';
            case 'NATIONAL_ID':
              return 'البطاقة الوطنية';
            case 'VEHICLE_REG':
              return 'استمارة المركبة';
            case 'INSURANCE':
              return 'التأمين';
            default:
              return t;
          }
        };
        const names = expiredDocs.map((d) => labelFor(d.type)).join('، ');
        throw new BadRequestException(
          `انتهت صلاحية: ${names}. يرجى تجديدها من شاشة المستندات.`,
        );
      }
      
      // 5. Check Vehicle status and expiry
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { driverId: driver.id },
      });
      if (!vehicle || vehicle.status !== 'APPROVED') {
        throw new BadRequestException('Your vehicle is not approved yet.');
      }
      if (
        vehicle.registrationExpiry &&
        new Date(vehicle.registrationExpiry) < startOfToday
      ) {
        throw new BadRequestException(
          'انتهت صلاحية تسجيل المركبة. يرجى تحديث استمارة المركبة من شاشة المستندات.',
        );
      }
    }

    // Update driver online status
    await this.prisma.driver.update({
      where: { userId },
      data: { isOnline },
    });

    // No Redis needed - location is stored in PostgreSQL
    if (isOnline) {
      console.log(`✅ Driver ${userId} is now online`);
    } else {
      console.log(`❌ Driver ${userId} is now offline`);
    }

    // Emit WebSocket event
    await this.driverGateway.sendDriverUpdate(userId);

    return { success: true, isOnline };
  }

  async getActiveRides(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const rides = await this.prisma.ride.findMany({
      where: {
        driverId: driver.id,
        status: {
          in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'],
        },
      },
      include: {
        consumer: {
          include: {
            user: true,
          },
        },
        hourlyRide: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { rides };
  }

  async getHourlyMeter(userId: string, rideId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: { user: { include: { wallet: true } } },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: {
        driverId: true,
        hourlyRide: true,
        vehicleTypeId: true,
      },
    });
    if (!ride || ride.driverId !== driver.id) {
      throw new NotFoundException('Ride not found');
    }
    const h = ride.hourlyRide;
    if (!h) {
      return { runningTotal: 0, idleSeconds: 0, movingKm: 0 };
    }

    // Derive commission so far so the driver app can warn / force-end
    // when the platform's cut exceeds the driver's wallet (with a small
    // grace debt).
    let adminCommissionPercent = 15;
    if (ride.vehicleTypeId) {
      const vt = await this.prisma.vehicleType.findUnique({
        where: { id: ride.vehicleTypeId },
        select: { adminCommission: true },
      });
      if (vt) adminCommissionPercent = Number(vt.adminCommission);
    }
    const runningTotal = Number(h.runningTotal);
    const commissionSoFar = runningTotal * (adminCommissionPercent / 100);
    const balance = driver.user.wallet
      ? Number(driver.user.wallet.balance)
      : 0;
    const debtAllowance = 50;
    const shouldEndRide = balance + debtAllowance - commissionSoFar < 0;
    const lowBalance = balance - commissionSoFar < 0;

    return {
      runningTotal,
      basePrice: Number(h.basePrice),
      idleSeconds: h.idleSeconds,
      movingKm: Number(h.movingKm),
      startedAt: h.startedAt,
      // Commission + balance state for live UI
      adminCommissionPercent,
      commissionSoFar,
      balance,
      debtAllowance,
      lowBalance,
      shouldEndRide,
    };
  }

  async getRideHistory(userId: string, page: number, limit: number) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const rides = await this.prisma.ride.findMany({
      where: {
        driverId: driver.id,
        status: {
          in: ['COMPLETED', 'CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER'],
        },
      },
      include: {
        consumer: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { rides };
  }

  async acceptRide(userId: string, rideId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: {
        user: { include: { wallet: true } },
        vehicles: {
          where: { isActive: true, status: 'APPROVED' },
          take: 1,
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    // Wallet must cover the platform commission for this ride before
    // accepting. For city rides we use the estimatedFare; for open
    // rides we use the basePrice as a floor (the meter takes over from
    // there). No debt allowed at accept — the 50 MRU debt grace only
    // applies once the trip is in progress.
    const rideToCheck = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: {
        rideType: true,
        estimatedFare: true,
        vehicleTypeId: true,
        hourlyRide: { select: { basePrice: true } },
      },
    });
    if (rideToCheck) {
      let adminCommissionPercent = 15;
      if (rideToCheck.vehicleTypeId) {
        const vt = await this.prisma.vehicleType.findUnique({
          where: { id: rideToCheck.vehicleTypeId },
          select: { adminCommission: true },
        });
        if (vt) adminCommissionPercent = Number(vt.adminCommission);
      }
      const reference =
        rideToCheck.rideType === 'HOURLY'
          ? Number(rideToCheck.hourlyRide?.basePrice ?? 0)
          : Number(rideToCheck.estimatedFare ?? 0);
      const commissionDue = reference * (adminCommissionPercent / 100);
      const balance = driver.user.wallet
        ? Number(driver.user.wallet.balance)
        : 0;
      if (commissionDue > 0 && balance < commissionDue) {
        throw new BadRequestException(
          `رصيدك غير كافٍ — تحتاج ${commissionDue.toFixed(0)} MRU على الأقل لقبول هذه الرحلة (رصيدك: ${balance.toFixed(0)} MRU)`,
        );
      }
    }

    const vehicleId = driver.vehicles?.[0]?.id;

    const ride = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'DRIVER_ASSIGNED',
        driverId: driver.id,
        vehicleId: vehicleId,
        acceptedAt: new Date(),
      },
      include: {
        consumer: {
          include: { user: true },
        },
      },
    });

    // Mark driver as on trip so they don't receive new ride notifications
    await this.prisma.driver.update({
      where: { userId },
      data: { isOnTrip: true },
    });

    // Reject other pending offers for this ride
    await this.prisma.rideOffer.updateMany({
      where: { rideId, driverId: { not: driver.id }, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });

    await this.broadcastRideUpdate(rideId);
    return { success: true, ride };
  }

  async rejectRide(userId: string, rideId: string, reason: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (driver) {
      await this.prisma.rideOffer.updateMany({
        where: { rideId, driverId: driver.id, status: 'PENDING' },
        data: { status: 'REJECTED', respondedAt: new Date() },
      });

      // If no more PENDING offers remain, check if ride was targeted to a single driver
      const pendingCount = await this.prisma.rideOffer.count({
        where: { rideId, status: 'PENDING' },
      });

      if (pendingCount === 0) {
        // Count distinct drivers who were ever offered this ride
        const allOffers = await this.prisma.rideOffer.findMany({
          where: { rideId },
          select: { driverId: true },
          distinct: ['driverId'],
        });

        if (allOffers.length <= 1) {
          // Ride was sent to only one driver and they rejected — mark as no drivers found
          await this.prisma.ride
            .update({
              where: { id: rideId },
              data: { status: 'NO_DRIVERS_FOUND' },
            })
            .catch(() => {});
        }
        // If multiple drivers were offered, keep ride as SEARCHING
        // so the admin/system can resend to new drivers
      }
    }
    return { success: true };
  }

  async arrivedAtPickup(userId: string, rideId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update ride status to DRIVER_ARRIVED
    const ride = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'DRIVER_ARRIVED',
        arrivedAt: new Date(),
      },
      include: {
        consumer: {
          include: { user: true },
        },
      },
    });

    // Log event
    await this.prisma.rideLog.create({
      data: { rideId, event: 'DRIVER_ARRIVED', data: { driverId: driver.id } },
    });

    console.log(`✅ Driver ${driver.id} arrived at pickup for ride ${rideId}`);

    await this.broadcastRideUpdate(rideId);
    return { success: true, ride };
  }

  async startRide(userId: string, rideId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const ride = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
      include: {
        consumer: {
          include: { user: true },
        },
      },
    });

    // Mark driver as on trip
    await this.prisma.driver.update({
      where: { userId },
      data: { isOnTrip: true },
    });

    // Log event
    await this.prisma.rideLog.create({
      data: { rideId, event: 'STARTED', data: { driverId: driver.id } },
    });

    // For hourly rides: stamp startedAt on the HourlyRide row so the
    // meter begins now. Also seed the baseline GPS sample with the
    // driver's current location so the next location ping has a valid
    // delta to compute against.
    if (ride.rideType === 'HOURLY') {
      try {
        const driverLoc = await this.prisma.driver.findUnique({
          where: { id: driver.id },
          select: { currentLat: true, currentLng: true },
        });
        const existing = await this.prisma.hourlyRide.findUnique({
          where: { rideId },
          select: { basePrice: true },
        });
        const basePrice = existing?.basePrice ? Number(existing.basePrice) : 0;
        await this.prisma.hourlyRide.update({
          where: { rideId },
          data: {
            startedAt: new Date(),
            lastSampleAt: new Date(),
            lastLat: driverLoc?.currentLat ?? null,
            lastLng: driverLoc?.currentLng ?? null,
            // Reset live counters but keep the base price as the
            // starting fare — it's owed the moment the trip begins.
            runningTotal: basePrice as any,
            idleSeconds: 0,
            movingKm: 0 as any,
          },
        });
      } catch (e) {
        console.error('Failed to stamp hourlyRide.startedAt:', e);
      }
    }

    console.log(`🚗 Ride ${rideId} started by driver ${driver.id}`);

    await this.broadcastRideUpdate(rideId);
    return { success: true, ride };
  }

  async completeRide(userId: string, rideId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: { user: { include: { wallet: true } } },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    // Idempotency: if the ride is already COMPLETED return the previous
    // result so a retried tap from the driver app doesn't 500.
    if (ride.status === 'COMPLETED') {
      console.log(`ℹ️ Ride ${rideId} already completed — returning prior result`);
      const wallet = driver.user.wallet
        ? await this.prisma.wallet.findUnique({
            where: { id: driver.user.wallet.id },
          })
        : null;
      const minSetting = await this.prisma.systemSetting.findUnique({
        where: { key: 'driver_minimum_balance' },
      });
      const minimumBalance = minSetting ? Number(minSetting.value) : 0;
      const finalFare = Number(ride.finalFare || ride.estimatedFare || 0);
      // Best-effort estimate (vehicle commission may differ but it's just
      // for display; backend already booked the real numbers).
      const driverShare = finalFare * 0.85;
      return {
        success: true,
        ride,
        driverShare,
        autoOfflined: false,
        minimumBalance,
        alreadyCompleted: true,
        currentBalance: wallet ? Number(wallet.balance) : 0,
      };
    }

    // For hourly rides, finalize the meter first so finalFare reflects
    // actual time used + any extra-time charges. Otherwise we'd bill the
    // pre-booked estimate instead of what really happened.
    if (ride.rideType === 'HOURLY') {
      try {
        const hourly = await this.prisma.hourlyRide.findUnique({
          where: { rideId },
        });
        if (hourly && !hourly.endedAt) {
          const startedAt = hourly.startedAt ?? new Date();
          const endedAt = new Date();
          const actualMinutes = Math.max(
            1,
            Math.round((endedAt.getTime() - startedAt.getTime()) / 60000),
          );

          // The meter has been accumulating in `runningTotal` as the driver
          // moved/stopped. Use that as the actual total — it already
          // reflects idle minutes × per-minute and moving km × per-km.
          // If for some reason runningTotal is 0 (e.g. no GPS pings) fall
          // back to the simple time-only charge.
          const minute = Number(hourly.pricePerHour) / 60;
          const fallbackTotal = minute * actualMinutes;
          const actualTotal = Number(hourly.runningTotal) > 0
            ? Number(hourly.runningTotal)
            : fallbackTotal;

          // For information only — not used to charge again.
          const bookedTotalMinutes =
            hourly.bookedHours * 60 + hourly.bookedMinutes;
          const extraMinutes = Math.max(
            0,
            actualMinutes - bookedTotalMinutes,
          );

          await this.prisma.hourlyRide.update({
            where: { rideId },
            data: {
              actualMinutes,
              actualTotal: actualTotal as any,
              extraMinutes,
              extraCharge: 0 as any, // already part of runningTotal
              endedAt,
            },
          });
          // Patch the Ride.finalFare so the commission is computed off
          // the actual total instead of the pre-booked estimate.
          await this.prisma.ride.update({
            where: { id: rideId },
            data: { finalFare: actualTotal as any },
          });
          // Mutate the in-memory ride object so the finalFare assignment
          // below reads the new value.
          (ride as any).finalFare = actualTotal;
        }
      } catch (e) {
        console.error('Hourly finalize failed (continuing with estimate):', e);
      }
    }

    const finalFare = Number(ride.finalFare || ride.estimatedFare || 0);

    // Look up vehicle type admin commission
    let adminCommissionPercent = 15; // Default
    if (ride.vehicleTypeId) {
      const vehicleType = await this.prisma.vehicleType.findUnique({
        where: { id: ride.vehicleTypeId },
      });
      if (vehicleType) {
        adminCommissionPercent = Number(vehicleType.adminCommission);
      }
    }

    const driverShare = finalFare * ((100 - adminCommissionPercent) / 100);
    const commissionAmount = finalFare - driverShare;

    // Update ride to COMPLETED
    const updatedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        finalFare: finalFare,
      },
    });

    // Mark driver as no longer on trip
    await this.prisma.driver.update({
      where: { userId },
      data: { isOnTrip: false, totalTrips: { increment: 1 }, totalEarnings: { increment: driverShare } },
    });

    // For CASH payments, the driver collects the full fare.
    // The platform only deducts its commission from the driver's wallet.
    if (driver.user.wallet && commissionAmount > 0) {
      // Debit driver wallet for the commission amount
      await this.prisma.wallet.update({
        where: { id: driver.user.wallet.id },
        data: { balance: { decrement: commissionAmount } },
      });

      // Create commission deduction transaction
      if (commissionAmount > 0) {
        await this.prisma.transaction.create({
          data: {
            walletId: driver.user.wallet.id,
            userId: userId,
            type: 'COMMISSION_DEDUCTION',
            amount: -commissionAmount,
            status: 'COMPLETED',
            rideId: rideId,
            description: `عمولة المنصة (${adminCommissionPercent}%)`,
            descriptionAr: `عمولة المنصة (${adminCommissionPercent}%)`,
          },
        });
      }
    }

    // Log ride completion
    await this.prisma.rideLog.create({
      data: { rideId, event: 'COMPLETED', data: { finalFare, driverShare, commissionAmount, adminCommissionPercent } },
    });

    // Emit WebSocket update to driver
    await this.driverGateway.sendDriverUpdate(userId);

    console.log(`✅ Ride ${rideId} completed by driver ${driver.id}, earned ${driverShare} MRU (commission: ${commissionAmount} MRU at ${adminCommissionPercent}%)`);

    // Update assignment progress (rides + earnings + duration)
    try {
      const startedAt = updatedRide.startedAt ?? updatedRide.acceptedAt ?? updatedRide.createdAt;
      const completedAt = updatedRide.completedAt ?? new Date();
      const durationMinutes = Math.max(
        1,
        Math.round((completedAt.getTime() - startedAt.getTime()) / 60000),
      );
      await this.assignmentsService.onRideCompleted({
        driverId: driver.id,
        fareAmount: driverShare,
        durationMinutes,
      });
    } catch (e) {
      console.error('Failed to update assignment progress:', e);
    }

    // Auto-offline the driver if commission deduction pushed them below the
    // admin-configured minimum balance. We re-fetch the wallet to get the
    // post-deduction value, compare it against the threshold, and flip
    // `isOnline=false` so the driver stops receiving offers until they
    // top up.
    let autoOfflined = false;
    let minimumBalance = 0;
    try {
      const minSetting = await this.prisma.systemSetting.findUnique({
        where: { key: 'driver_minimum_balance' },
      });
      minimumBalance = minSetting ? Number(minSetting.value) : 0;
      const updatedWallet = driver.user.wallet
        ? await this.prisma.wallet.findUnique({
            where: { id: driver.user.wallet.id },
          })
        : null;
      const newBalance = updatedWallet ? Number(updatedWallet.balance) : 0;
      if (
        minimumBalance > 0 &&
        newBalance < minimumBalance &&
        driver.isOnline
      ) {
        await this.prisma.driver.update({
          where: { userId },
          data: { isOnline: false },
        });
        autoOfflined = true;
        console.log(
          `⚠️ Driver ${driver.id} auto-offlined: balance ${newBalance} below minimum ${minimumBalance}`,
        );
      }
    } catch (e) {
      console.error('Auto-offline check failed:', e);
    }

    await this.broadcastRideUpdate(rideId);
    return {
      success: true,
      ride: updatedRide,
      driverShare,
      autoOfflined,
      minimumBalance,
    };
  }

  /// Push the latest ride payload to the rider over their WS connection.
  /// Best-effort — failure here must not break the HTTP response.
  private async broadcastRideUpdate(rideId: string) {
    try {
      const ride = await this.prisma.ride.findUnique({
        where: { id: rideId },
        include: {
          consumer: { include: { user: true } },
          driver: { include: { user: true } },
          vehicle: true,
          vehicleType: true,
        },
      });
      if (ride) this.consumerGateway.emitRideUpdate(rideId, ride);
    } catch (e) {
      console.error('Failed to broadcast ride update:', e);
    }
  }

  async cancelRideByDriver(userId: string, rideId: string, reason: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const ride = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'CANCELLED_BY_DRIVER',
        cancelledAt: new Date(),
        cancelledBy: 'DRIVER',
        cancelReason: reason,
      },
    });

    // Mark driver as no longer on trip
    await this.prisma.driver.update({
      where: { userId },
      data: { isOnTrip: false },
    });

    // Log cancellation
    await this.prisma.rideLog.create({
      data: { rideId, event: 'CANCELLED', data: { cancelledBy: 'DRIVER', reason } },
    });

    console.log(`❌ Ride ${rideId} cancelled by driver ${driver.id}: ${reason}`);

    await this.broadcastRideUpdate(rideId);
    return { success: true, ride };
  }

  async getEarnings(userId: string, period?: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Calculate earnings based on period
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'daily':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'weekly':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'monthly':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        startDate = new Date(now.setHours(0, 0, 0, 0));
    }

    const rides = await this.prisma.ride.findMany({
      where: {
        driverId: driver.id,
        status: 'COMPLETED',
        completedAt: {
          gte: startDate,
        },
      },
    });

    const totalEarnings = rides.reduce((sum, ride) => sum + Number(ride.finalFare || 0), 0);
    const totalRides = rides.length;
    const totalDistance = rides.reduce((sum, ride) => sum + Number(ride.distanceKm || 0), 0);

    return {
      totalEarnings,
      totalRides,
      totalDistance,
      totalHours: 0, // TODO: Calculate from ride durations
    };
  }

  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { 
        userId,
        type: 'DRIVER',
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async uploadDocument(userId: string, uploadDocumentDto: UploadDocumentDto) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const { documentType, fileUrl, expiresAt } = uploadDocumentDto;

    // Map frontend document types to Prisma enum values
    const typeMap: Record<string, string> = {
      [DocumentType.LICENSE]: 'LICENSE',
      [DocumentType.NATIONAL_ID]: 'NATIONAL_ID',
      [DocumentType.NATIONAL_ID_BACK]: 'NATIONAL_ID_BACK',
      [DocumentType.PROFILE_PHOTO]: 'PROFILE_PHOTO',
      [DocumentType.VEHICLE_REG]: 'VEHICLE_REG',
      [DocumentType.INSURANCE]: 'INSURANCE',
      [DocumentType.VEHICLE_PHOTO]: 'OTHER', // Map to OTHER since VEHICLE_PHOTO doesn't exist in Prisma
      [DocumentType.CONTRACT]: 'CONTRACT',
    };

    const prismaDocType = typeMap[documentType] || documentType;

    // Documents that MUST come with an expiry date.
    const requiresExpiry = [
      'LICENSE',
      'NATIONAL_ID',
      'NATIONAL_ID_BACK',
      'VEHICLE_REG',
      'INSURANCE',
    ].includes(prismaDocType);

    if (requiresExpiry) {
      if (!expiresAt) {
        throw new BadRequestException(
          'يجب تحديد تاريخ انتهاء المستند قبل الرفع'
        );
      }
      const exp = new Date(expiresAt);
      if (isNaN(exp.getTime())) {
        throw new BadRequestException('تاريخ انتهاء غير صالح');
      }
      // Block past dates — driver must commit to a valid future date.
      if (exp.getTime() < Date.now()) {
        throw new BadRequestException(
          'تاريخ الانتهاء يجب أن يكون في المستقبل'
        );
      }
    }

    // Check if document already exists
    const existingDoc = await this.prisma.document.findFirst({
      where: {
        userId,
        type: prismaDocType as any,
      },
    });

    // Prevent re-uploading APPROVED documents UNLESS they have already
    // expired — driver needs to be able to renew an expired license, ID,
    // registration, or insurance with a fresh photo + future date.
    const isExpiredApproved =
      existingDoc &&
      existingDoc.status === 'APPROVED' &&
      existingDoc.expiresAt &&
      new Date(existingDoc.expiresAt).getTime() < Date.now();

    if (existingDoc && existingDoc.status === 'APPROVED' && !isExpiredApproved) {
      throw new BadRequestException(
        'This document has already been approved and cannot be changed'
      );
    }

    // Only allow re-upload if document is rejected, pending, or expired
    if (existingDoc && existingDoc.status === 'PENDING') {
      throw new BadRequestException(
        'This document is currently under review. Please wait for admin decision.'
      );
    }

    let document;
    if (existingDoc) {
      // Update existing document (only if rejected)
      document = await this.prisma.document.update({
        where: { id: existingDoc.id },
        data: {
          url: fileUrl,
          status: 'PENDING',
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          rejectionReason: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
    } else {
      // Create new document
      document = await this.prisma.document.create({
        data: {
          userId,
          type: prismaDocType as any,
          url: fileUrl,
          status: 'PENDING',
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });
    }

    // Also update legacy fields for backward compatibility
    const driverFieldMap: Record<string, string> = {
      [DocumentType.LICENSE]: 'licenseImage',
      [DocumentType.NATIONAL_ID]: 'nationalIdImage',
      [DocumentType.NATIONAL_ID_BACK]: 'nationalIdBackImage',
      [DocumentType.PROFILE_PHOTO]: 'profilePhoto',
    };

    const vehicleFieldMap: Record<string, string> = {
      [DocumentType.VEHICLE_REG]: 'registrationImage',
      [DocumentType.INSURANCE]: 'insuranceImage',
      [DocumentType.VEHICLE_PHOTO]: 'inspectionImage',
    };

    if (driverFieldMap[documentType]) {
      await this.prisma.driver.update({
        where: { userId },
        data: {
          [driverFieldMap[documentType]]: fileUrl,
        },
      });
    } else if (vehicleFieldMap[documentType]) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { driverId: driver.id },
      });

      if (vehicle) {
        // When a new VEHICLE_REG is uploaded with an expiry date, sync the
        // expiry onto the Vehicle record too — it's a separate column from
        // the Document, and the go-online check reads from Vehicle.
        const updateData: Record<string, any> = {
          [vehicleFieldMap[documentType]]: fileUrl,
        };
        if (
          documentType === DocumentType.VEHICLE_REG &&
          expiresAt
        ) {
          updateData.registrationExpiry = new Date(expiresAt);
        }
        await this.prisma.vehicle.update({
          where: { id: vehicle.id },
          data: updateData,
        });
      }
    }

    return {
      success: true,
      message: 'Document uploaded successfully',
      document: {
        id: document.id,
        type: document.type,
        url: document.url,
        status: document.status,
        rejectionReason: document.rejectionReason,
        expiresAt: document.expiresAt,
        createdAt: document.createdAt,
        reviewedAt: document.reviewedAt,
      },
    };
  }

  async getDocuments(userId: string) {
    const documents = await this.prisma.document.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        url: true,
        status: true,
        rejectionReason: true,
        expiresAt: true,
        createdAt: true,
        reviewedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { documents };
  }

  async registerVehicle(
    userId: string,
    vehicleData: {
      brand: string;
      model: string;
      year: number;
      color: string;
      colorAr: string;
      plateNumber: string;
      registrationNumber: string;
      registrationExpiry: string;
    },
  ) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Check if driver already has a vehicle
    const existingVehicle = await this.prisma.vehicle.findFirst({
      where: { driverId: driver.id },
    });

    if (existingVehicle) {
      throw new BadRequestException('Driver already has a registered vehicle');
    }

    // Create vehicle with PENDING status (admin will assign type and approve)
    const vehicle = await this.prisma.vehicle.create({
      data: {
        driverId: driver.id,
        // typeId is undefined - Admin will assign this based on vehicle info
        brand: vehicleData.brand,
        model: vehicleData.model,
        year: vehicleData.year,
        color: vehicleData.color,
        colorAr: vehicleData.colorAr,
        plateNumber: vehicleData.plateNumber,
        registrationNumber: vehicleData.registrationNumber,
        registrationExpiry: new Date(vehicleData.registrationExpiry),
        status: 'PENDING', // Requires admin approval
        isActive: false,
      },
    });

    console.log(`✅ Vehicle registered for driver ${driver.id}, awaiting admin approval`);

    return {
      success: true,
      message: 'Vehicle registered successfully. Awaiting admin approval.',
      vehicle: {
        id: vehicle.id,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        plateNumber: vehicle.plateNumber,
        status: vehicle.status,
      },
    };
  }
}


// ─── Helpers ───────────────────────────────────────────────────────────────

/// Great-circle distance in kilometers between two GPS coords.
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const r = 6371; // earth radius km
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}
