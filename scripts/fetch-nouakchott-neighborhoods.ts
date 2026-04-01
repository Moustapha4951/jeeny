import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Google Maps API Key
const GOOGLE_MAPS_API_KEY = 'AIzaSyA3d_eeqGLWTHxa2UvYzVa86z6xHiUnEew';

// Nouakchott center coordinates
const NOUAKCHOTT_CENTER = {
  lat: 18.0735,
  lng: -15.9582,
};

async function fetchNouakchottNeighborhoods() {
  console.log('Fetching Nouakchott neighborhoods from Google Places API...');

  try {
    // Use Places API Nearby Search to find sublocalities (neighborhoods)
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
      {
        params: {
          location: `${NOUAKCHOTT_CENTER.lat},${NOUAKCHOTT_CENTER.lng}`,
          radius: 20000, // 20km radius
          type: 'sublocality',
          key: GOOGLE_MAPS_API_KEY,
        },
      }
    );

    if (response.data.status === 'OK') {
      console.log(`Found ${response.data.results.length} neighborhoods`);
      
      for (const place of response.data.results) {
        console.log('\n---');
        console.log('Name:', place.name);
        console.log('Location:', place.geometry.location);
        console.log('Types:', place.types);
        console.log('Vicinity:', place.vicinity);
      }

      return response.data.results;
    } else {
      console.error('API Error:', response.data.status);
      console.error('Error message:', response.data.error_message);
    }
  } catch (error) {
    console.error('Error fetching neighborhoods:', error);
  }
}

// Alternative: Use Geocoding API to get administrative areas
async function fetchNouakchottAdministrativeAreas() {
  console.log('\nFetching Nouakchott administrative areas...');

  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/geocode/json',
      {
        params: {
          address: 'Nouakchott, Mauritania',
          key: GOOGLE_MAPS_API_KEY,
        },
      }
    );

    if (response.data.status === 'OK') {
      console.log('\nGeocoding results:');
      for (const result of response.data.results) {
        console.log('\n---');
        console.log('Formatted Address:', result.formatted_address);
        console.log('Address Components:');
        for (const component of result.address_components) {
          console.log(`  - ${component.long_name} (${component.types.join(', ')})`);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching administrative areas:', error);
  }
}

// Known Nouakchott communes (مقاطعات)
const NOUAKCHOTT_COMMUNES = [
  { name: 'Tevragh Zeina', nameAr: 'تفرغ زينة', lat: 18.0985, lng: -15.9739 },
  { name: 'Ksar', nameAr: 'القصر', lat: 18.0885, lng: -15.9839 },
  { name: 'Sebkha', nameAr: 'السبخة', lat: 18.0785, lng: -15.9939 },
  { name: 'Arafat', nameAr: 'عرفات', lat: 18.0685, lng: -15.9539 },
  { name: 'Dar Naim', nameAr: 'دار النعيم', lat: 18.0585, lng: -15.9339 },
  { name: 'Toujounine', nameAr: 'توجنين', lat: 18.0485, lng: -15.9139 },
  { name: 'El Mina', nameAr: 'الميناء', lat: 18.0885, lng: -16.0039 },
  { name: 'Teyarett', nameAr: 'تيارت', lat: 18.1185, lng: -15.9439 },
  { name: 'Riyadh', nameAr: 'الرياض', lat: 18.0385, lng: -15.9739 },
];

async function seedNouakchottCommunes() {
  console.log('\nSeeding Nouakchott communes...');

  for (const commune of NOUAKCHOTT_COMMUNES) {
    // Create a simple polygon around the center point (approximately 2km x 2km)
    const offset = 0.01; // roughly 1km
    const polygon = {
      type: 'Polygon',
      coordinates: [[
        [commune.lng - offset, commune.lat - offset],
        [commune.lng + offset, commune.lat - offset],
        [commune.lng + offset, commune.lat + offset],
        [commune.lng - offset, commune.lat + offset],
        [commune.lng - offset, commune.lat - offset],
      ]],
    };

    const existing = await prisma.zone.findFirst({
      where: { name: commune.name },
    });

    if (existing) {
      await prisma.zone.update({
        where: { id: existing.id },
        data: {
          name: commune.name,
          nameAr: commune.nameAr,
          nameFr: commune.name,
          type: 'CITY', // Using CITY type for neighborhoods/communes
          polygon,
          center: { latitude: commune.lat, longitude: commune.lng },
          isActive: true,
          surgeMultiplier: 1.0,
        },
      });
      console.log(`✓ Updated: ${commune.nameAr} (${commune.name})`);
    } else {
      await prisma.zone.create({
        data: {
          name: commune.name,
          nameAr: commune.nameAr,
          nameFr: commune.name,
          type: 'CITY',
          polygon,
          center: { latitude: commune.lat, longitude: commune.lng },
          isActive: true,
          surgeMultiplier: 1.0,
        },
      });
      console.log(`✓ Created: ${commune.nameAr} (${commune.name})`);
    }
  }

  console.log('\nCommunes seeded successfully!');
}

async function main() {
  console.log('=== Nouakchott Neighborhoods Fetcher ===\n');

  // Try to fetch from Google Places API
  await fetchNouakchottNeighborhoods();
  
  // Try geocoding
  await fetchNouakchottAdministrativeAreas();

  // Seed known communes
  await seedNouakchottCommunes();
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
