#!/usr/bin/env node
/**
 * Generate data.js from Uber Data folder
 * 
 * Usage: node generate_data.js
 * 
 * This reads CSV files from the "Uber Data" folder and generates
 * a data.js file that the app can auto-load.
 * 
 * Handles split files (e.g., trips_data-0.csv, trips_data-1.csv, etc.)
 */

const fs = require('fs');
const path = require('path');

// Paths to data
const DATA_DIR = path.join(__dirname, 'Uber Data');
const OUTPUT_FILE = path.join(__dirname, 'data.js');

// File patterns to look for (will match -0, -1, -2, etc.)
const FILE_PATTERNS = {
    trips: { dir: 'Rider', base: 'trips_data' },
    orders: { dir: 'Eats', base: 'user_orders' },
    profile: { dir: 'Account and Profile', base: 'user_profile' },
    ratings: { dir: 'Rider', base: 'rider_lifetime_ratings_received' }
};

// Helper to parse CSV line respecting quotes
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function parseCSVContent(content) {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    
    const rows = lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const entry = {};
        headers.forEach((h, i) => {
            entry[h] = values[i] ? values[i].trim() : '';
        });
        return entry;
    });
    
    return { headers, rows };
}

/**
 * Find all numbered files matching a pattern and merge their data
 * e.g., trips_data-0.csv, trips_data-1.csv, trips_data-2.csv
 */
function findAndMergeCSVs(dir, baseName) {
    const fullDir = path.join(DATA_DIR, dir);
    if (!fs.existsSync(fullDir)) {
        console.log(`  Directory not found: ${dir}`);
        return [];
    }
    
    const files = fs.readdirSync(fullDir)
        .filter(f => f.startsWith(baseName) && f.endsWith('.csv'))
        .sort(); // Ensures -0, -1, -2 order
    
    if (files.length === 0) {
        console.log(`  No files matching ${baseName}*.csv in ${dir}`);
        return [];
    }
    
    let allRows = [];
    files.forEach(file => {
        const filePath = path.join(fullDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const { rows } = parseCSVContent(content);
        allRows = allRows.concat(rows);
        console.log(`  Loaded ${rows.length} rows from ${dir}/${file}`);
    });
    
    return allRows;
}

function initStats() {
    return {
        trips: [],
        totalSpent: 0,
        totalMiles: 0,
        cityCounts: {},
        timeOfDayCounts: { morning: 0, afternoon: 0, evening: 0, night: 0 },
        totalMovingTimeSeconds: 0,
        rideTypes: {},
        surgeCount: 0,
        totalSurgeMultiplier: 0,
        surgeTripCount: 0,
        splitFareCount: 0,
        multiDestCount: 0,
        uniqueOrders: {},
        restaurantCounts: {},
        restaurantSpend: {},
        itemCounts: {},
        heatmapData: { pickup: [], dropoff: [] },
        tripDates: new Set(),    // Track unique dates for streak calculation
        orderDates: new Set(),   // Track unique order dates for streak calculation
        dayOfWeekCounts: [0, 0, 0, 0, 0, 0, 0], // 0=Sun, 6=Sat
        orderTimeOfDayCounts: { morning: 0, afternoon: 0, evening: 0, night: 0 }
    };
}

function calculateMaxStreak(dateSet) {
    if (dateSet.size === 0) return 0;
    const sorted = Array.from(dateSet).sort();
    let maxStreak = 1;
    let currentStreak = 1;
    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1]);
        const curr = new Date(sorted[i]);
        const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
        } else if (diffDays > 1) {
            currentStreak = 1;
        }
    }
    return maxStreak;
}

function updateTripStats(stats, t) {
    const fare = parseFloat(t.fare_amount || t.client_upfront_fare_local || t.original_fare_local || 0);
    if (!isNaN(fare)) stats.totalSpent += fare;

    const miles = parseFloat(t.trip_distance_miles || 0);
    if (!isNaN(miles)) stats.totalMiles += miles;

    if (t.city_name) {
        stats.cityCounts[t.city_name] = (stats.cityCounts[t.city_name] || 0) + 1;
    }

    const dateStr = t.request_timestamp_local || t.request_timestamp_utc;
    if (dateStr) {
        const localDate = new Date(dateStr);
        if (!isNaN(localDate.getTime())) {
            const hour = localDate.getHours();
            if (hour >= 5 && hour < 12) stats.timeOfDayCounts.morning++;
            else if (hour >= 12 && hour < 17) stats.timeOfDayCounts.afternoon++;
            else if (hour >= 17 && hour < 21) stats.timeOfDayCounts.evening++;
            else stats.timeOfDayCounts.night++;

            // Day of Week
            stats.dayOfWeekCounts[localDate.getDay()]++;

            // Streak Calculation
            const tripDate = localDate.toISOString().split('T')[0];
            stats.tripDates.add(tripDate);
        }
    }

    const duration = parseFloat(t.trip_duration_seconds || 0);
    if (!isNaN(duration)) stats.totalMovingTimeSeconds += duration;

    let type = t.product_type_name || 'Unknown';
    if (type.toLowerCase() === 'uberxl') type = 'UberXL';
    if (type.toLowerCase() === 'uberx') type = 'UberX';
    stats.rideTypes[type] = (stats.rideTypes[type] || 0) + 1;

    if (t.is_surged === 'true' || t.is_surged === true) {
        stats.surgeCount++;
    }
    const multiplier = parseFloat(t.surge_multiplier || 1);
    if (!isNaN(multiplier) && multiplier > 1) {
        stats.totalSurgeMultiplier += multiplier;
        stats.surgeTripCount++;
    }

    if (t.is_fare_split === 'true' || t.is_fare_split === true) {
        stats.splitFareCount++;
    }

    if (t.is_multidestination === 'true' || t.is_multidestination === true) {
        stats.multiDestCount++;
    }

    if (t.begintrip_lat && t.begintrip_lng) {
        const lat = parseFloat(t.begintrip_lat);
        const lng = parseFloat(t.begintrip_lng);
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            stats.heatmapData.pickup.push([lat, lng]);
        }
    }

    if (t.dropoff_lat && t.dropoff_lng) {
        const lat = parseFloat(t.dropoff_lat);
        const lng = parseFloat(t.dropoff_lng);
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            stats.heatmapData.dropoff.push([lat, lng]);
        }
    }
}

function formatTripStats(stats, tripCount) {
    const topCities = Object.entries(stats.cityCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([city, count]) => ({ city, count }));

    const topRideTypes = Object.entries(stats.rideTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => ({ type, count }));

    return {
        totalTrips: tripCount,
        totalSpent: stats.totalSpent.toFixed(2),
        totalMiles: stats.totalMiles.toFixed(2),
        topCities,
        timeOfDayCounts: stats.timeOfDayCounts,
        totalDurationHours: (stats.totalMovingTimeSeconds / 3600).toFixed(1),
        rideTypes: topRideTypes,
        surgeCount: stats.surgeCount,
        avgSurgeMultiplier: stats.surgeTripCount > 0 ? (stats.totalSurgeMultiplier / stats.surgeTripCount).toFixed(2) : 0,
        splitFareCount: stats.splitFareCount,
        multiDestCount: stats.multiDestCount,
        heatmapData: stats.heatmapData,
        maxStreak: calculateMaxStreak(stats.tripDates),
        dayOfWeekCounts: stats.dayOfWeekCounts
    };
}

function analyzeTrips(trips) {
    const years = {};
    const lifetime = initStats();
    let lifetimeTripCount = 0;

    trips.forEach(t => {
        // Include both 'completed' and 'fare_split' as valid completed trips
        if (t.status !== 'completed' && t.status !== 'fare_split') return;

        const dateStr = t.request_timestamp_utc || t.request_timestamp_local;
        if (!dateStr) return;

        const date = new Date(dateStr);
        const year = date.getFullYear();

        if (!years[year]) {
            years[year] = { stats: initStats(), count: 0 };
        }

        years[year].count++;
        lifetimeTripCount++;

        updateTripStats(years[year].stats, t);
        updateTripStats(lifetime, t);
    });

    const result = { years: {}, lifetime: formatTripStats(lifetime, lifetimeTripCount) };
    for (const year in years) {
        result.years[year] = formatTripStats(years[year].stats, years[year].count);
    }
    return result;
}

function updateOrderStats(stats, o) {
    const orderKey = o.Request_Time_Local + (o.Restaurant_Name || '');

    if (!stats.uniqueOrders[orderKey]) {
        stats.uniqueOrders[orderKey] = {
            price: parseFloat(o.Order_Price || 0)
        };
        stats.totalSpent += stats.uniqueOrders[orderKey].price;

        if (o.Restaurant_Name) {
            let name = o.Restaurant_Name.replace(/\s*\(.*?\)\s*/g, '').trim();
            stats.restaurantCounts[name] = (stats.restaurantCounts[name] || 0) + 1;
            stats.restaurantSpend[name] = (stats.restaurantSpend[name] || 0) + stats.uniqueOrders[orderKey].price;
        }
    }

    const itemName = o.Item_Name;
    if (itemName) {
        stats.itemCounts[itemName] = (stats.itemCounts[itemName] || 0) + parseInt(o.Item_quantity || 1);
    }

    // Track order date for streak and day-of-week calculation
    const dateStr = o.Request_Time_Local;
    if (dateStr) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            const orderDate = date.toISOString().split('T')[0];
            stats.orderDates.add(orderDate);
            stats.dayOfWeekCounts[date.getDay()]++;
            
            // Time of day for orders
            const hour = date.getHours();
            if (hour >= 5 && hour < 12) stats.orderTimeOfDayCounts.morning++;
            else if (hour >= 12 && hour < 17) stats.orderTimeOfDayCounts.afternoon++;
            else if (hour >= 17 && hour < 21) stats.orderTimeOfDayCounts.evening++;
            else stats.orderTimeOfDayCounts.night++;
        }
    }
}

function formatOrderStats(stats) {
    const topRestaurants = Object.entries(stats.restaurantCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({
            name,
            count,
            spend: (stats.restaurantSpend[name] || 0).toFixed(2)
        }));

    const topItems = Object.entries(stats.itemCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    return {
        totalOrders: Object.keys(stats.uniqueOrders).length,
        totalSpent: stats.totalSpent.toFixed(2),
        topRestaurants,
        topItems,
        maxStreak: calculateMaxStreak(stats.orderDates),
        dayOfWeekCounts: stats.dayOfWeekCounts,
        timeOfDayCounts: stats.orderTimeOfDayCounts
    };
}

function analyzeOrders(orders) {
    const years = {};
    const lifetime = initStats();

    orders.forEach(o => {
        const dateStr = o.Request_Time_Local;
        if (!dateStr) return;
        const date = new Date(dateStr);
        const year = date.getFullYear();

        if (!years[year]) {
            years[year] = initStats();
        }

        updateOrderStats(years[year], o);
        updateOrderStats(lifetime, o);
    });

    const result = { years: {}, lifetime: formatOrderStats(lifetime) };
    for (const year in years) {
        result.years[year] = formatOrderStats(years[year]);
    }

    return result;
}

function getProfileInfo(profileData, ratingsData) {
    let memberSince = 'Unknown';
    if (profileData.length > 0 && profileData[0]['Signup Date']) {
        const d = new Date(profileData[0]['Signup Date']);
        memberSince = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    let avgRating = 0;
    if (ratingsData.length > 0) {
        const ratings = ratingsData.map(r => parseInt(r.five_star_rating)).filter(r => !isNaN(r));
        if (ratings.length > 0) {
            const sum = ratings.reduce((a, b) => a + b, 0);
            avgRating = (sum / ratings.length).toFixed(2);
        }
    }

    return { memberSince, avgRating };
}

// Main
try {
    console.log('Reading Uber data from:', DATA_DIR);
    console.log('Looking for split files (e.g., -0.csv, -1.csv, -2.csv)...\n');
    
    // Find and merge all split files
    const tripData = findAndMergeCSVs(FILE_PATTERNS.trips.dir, FILE_PATTERNS.trips.base);
    const orderData = findAndMergeCSVs(FILE_PATTERNS.orders.dir, FILE_PATTERNS.orders.base);
    const profileData = findAndMergeCSVs(FILE_PATTERNS.profile.dir, FILE_PATTERNS.profile.base);
    const ratingsData = findAndMergeCSVs(FILE_PATTERNS.ratings.dir, FILE_PATTERNS.ratings.base);

    console.log(`\nTotal: ${tripData.length} trips and ${orderData.length} order items`);

    const tripAnalysis = analyzeTrips(tripData);
    const orderAnalysis = analyzeOrders(orderData);
    const profile = getProfileInfo(profileData, ratingsData);

    const allYears = new Set([...Object.keys(tripAnalysis.years), ...Object.keys(orderAnalysis.years)]);
    const sortedYears = Array.from(allYears).sort((a, b) => b - a);

    const yearsData = {};

    yearsData['Lifetime'] = {
        trips: tripAnalysis.lifetime,
        eats: orderAnalysis.lifetime
    };

    const defaultTripStats = {
        totalTrips: 0, totalSpent: "0.00", totalMiles: "0.00",
        topCities: [], timeOfDayCounts: { morning: 0, afternoon: 0, evening: 0, night: 0 },
        rideTypes: [], surgeCount: 0, avgSurgeMultiplier: 0, splitFareCount: 0, multiDestCount: 0,
        totalDurationHours: "0.0", heatmapData: { pickup: [], dropoff: [] },
        maxStreak: 0, dayOfWeekCounts: [0, 0, 0, 0, 0, 0, 0]
    };

    const defaultOrderStats = {
        totalOrders: 0, totalSpent: "0.00", topRestaurants: [], topItems: [],
        maxStreak: 0, dayOfWeekCounts: [0, 0, 0, 0, 0, 0, 0],
        timeOfDayCounts: { morning: 0, afternoon: 0, evening: 0, night: 0 }
    };


    sortedYears.forEach(y => {
        yearsData[y] = {
            trips: tripAnalysis.years[y] || defaultTripStats,
            eats: orderAnalysis.years[y] || defaultOrderStats
        };
    });

    const output = { profile, years: yearsData };

    const fileContent = `window.UBER_DATA = ${JSON.stringify(output, null, 2)}`;
    fs.writeFileSync(OUTPUT_FILE, fileContent);
    console.log('\n✓ Generated data.js successfully');
    console.log(`  Years: ${sortedYears.join(', ')}`);

} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}

