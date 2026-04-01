import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Overpass API endpoint
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

async function fetchNouakchottFromOSM() {
  console.log('Fetching Nouakchott administrative boundaries from OpenStreetMap...');

  // Overpass QL query to get admin_level=6 (communes) in Nouakchott
  const query = `
    [out:json][timeout:25];
    area["name"="Nouakchott"]["admin_level"="4"]->.a;
    (
      relation["admin_level"="6"](area.a);
    );
    out geom;
  `;

  try {
    const response = await axios.post(OVERPASS_API, `data=${encodeURIComponent(query)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (response.data && response.data.elements) {
      console.log(`\nFound ${response.data.elements.length} administrative areas:\n`);

      for (const element of response.data.elements) {
        const name = element.tags?.name || 'Unknown';
        const nameAr = element.tags?.['name:ar'] || name;
        const nameFr = element.tags?.['name:fr'] || name;
        const adminLevel = element.tags?.admin_level;

        console.log('---');
        console.log('Name:', name);
        console.log('Name (Arabic):', nameAr);
        console.log('Name (French):', nameFr);
        console.log('Admin Level:', adminLevel);
        console.log('Type:', element.type);
        
        if (element.bounds) {
          console.log('Bounds:', element.bounds);
        }

        // Calculate center from bounds
        if (element.bounds) {
          const centerLat = (element.bounds.minlat + element.bounds.maxlat) / 2;
          const centerLon = (element.bounds.minlon + element.bounds.maxlon) / 2;
          console.log('Center:', { lat: centerLat, lon: centerLon });
        }

        console.log('');
      }

      return response.data.elements;
    }
  } catch (error: any) {
    console.error('Error fetching from OSM:', error.message);
  }
}

// Alternative query for Nouakchott regions
async function fetchNouakchottRegions() {
  console.log('\nFetching Nouakchott regions (alternative query)...');

  const query = `
    [out:json][timeout:25];
    (
      relation["name:ar"~"نواكشوط"]["admin_level"~"4|5|6"];
      relation["name"~"Nouakchott"]["admin_level"~"4|5|6"];
    );
    out geom;
  `;

  try {
    const response = await axios.post(OVERPASS_API, `data=${encodeURIComponent(query)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (response.data && response.data.elements) {
      console.log(`Found ${response.data.elements.length} regions:\n`);

      for (const element of response.data.elements) {
        console.log('---');
        console.log('Name:', element.tags?.name);
        console.log('Name (AR):', element.tags?.['name:ar']);
        console.log('Admin Level:', element.tags?.admin_level);
        console.log('');
      }
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

async function main() {
  console.log('=== OpenStreetMap Nouakchott Fetcher ===\n');

  await fetchNouakchottFromOSM();
  await fetchNouakchottRegions();
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
