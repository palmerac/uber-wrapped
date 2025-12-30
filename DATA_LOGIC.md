# Uber Data Processing Logic

This document explains how Uber Wrapped interprets and calculates statistics from your raw Uber data exports.

## 🚗 Uber Rides (Trips)

### Status Filtering
Only trips with a status of **`completed`** are counted in your statistics. 
- Cancelled trips, "fare_split" placeholder rows (in older exports), and "no_car_available" statuses are ignored.

### Total Spend Calculation
Calculated per ride using the following priority (taking the first one found):
1. `fare_amount`
2. `client_upfront_fare_local`
3. `original_fare_local`

> [!NOTE]
> Uber's raw trip export typically does **not** include tip amounts. The total spend shown is the sum of base fares, fees, and tolls.

### Distance & Duration
- **Distance**: Parsed from `trip_distance_miles`.
- **Duration**: Parsed from `trip_duration_seconds`.

### Special Badges
- **Social Butterfly**: Incremented if `is_fare_split` is true.
- **The Planner**: Incremented if `is_multidestination` is true.
- **Surge Warrior**: Incremented if `is_surged` is true or if `surge_multiplier` > 1.

---

## 🍔 Uber Eats (Orders)

### Status Filtering
The app prioritizes entries where `Order_Status` is **`completed`**. However, it also handles records where the status might be empty but order data exists.

### Spend & Deduplication
The Uber Eats export lists every **item** as a separate row. Each row repeats the **total order price**. 
To avoid multiplying your spend by the number of items:
1. The app creates a unique ID for each order based on `Request_Time_Local` + `Restaurant_Name`.
2. The `Order_Price` is only added to the total **once** per unique ID.

### Item Aggregation
- **Top Cravings**: Calculated by summing the `Item_quantity` for each `Item_Name`.

---

## 🕒 Time & Geography

- **Time of Day**: Based on `request_timestamp_local` (or `Request_Time_Local` for Eats).
    - **Morning**: 5:00 AM - 11:59 AM
    - **Afternoon**: 12:00 PM - 4:59 PM
    - **Evening**: 5:00 PM - 8:59 PM
    - **Night**: 9:00 PM - 4:59 AM
- **Heatmap**: Uses `begintrip_lat`/`lng` for pickups and `dropoff_lat`/`lng` for dropoffs. Zero/null coordinates are ignored.
