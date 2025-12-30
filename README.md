# Uber Wrapped 🚗🍔

A beautiful, privacy-first dashboard that visualizes your Uber ride and Uber Eats history—like Spotify Wrapped, but for your travels and takeout.

**[Live Demo →](https://uber-wrapped.pages.dev)**



## Features

- **📊 Complete Ride Stats** — Total trips, miles traveled, and spending
- **🗺️ Heatmap Visualization** — See your pickup and dropoff patterns on an interactive map
- **🍕 Uber Eats Breakdown** — Top restaurants, favorite orders, and total food spending
- **📅 Year-by-Year View** — Filter by year or view lifetime stats
- **🏆 Fun Insights** — Surge warrior count, split fares, multi-stop trips, and more
- **🔒 100% Private** — All data processing happens in your browser. Nothing is uploaded anywhere.

## How It Works

1. **Get Your Data** — Request your data export from [Uber's Privacy Center](https://myprivacy.uber.com/privacy/exploreyourdata/download)
2. **Drop & Go** — Drag and drop your downloaded `Uber Data` folder onto the page
3. **Explore** — View your personalized travel and food stats instantly

For a detailed breakdown of how spend, distances, and special stats are calculated, see [DATA_LOGIC.md](./DATA_LOGIC.md).

## Tech Stack

- Vanilla HTML, CSS, JavaScript (no frameworks)
- [Leaflet](https://leafletjs.com/) for interactive maps
- [Leaflet.heat](https://github.com/Leaflet/Leaflet.heat) for heatmap visualization
- Hosted on Cloudflare Pages

## Development

### Option 1: Drag & Drop (recommended)
Just run a local server and drag your Uber Data folder onto the page:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) and drop your `Uber Data` folder.

### Option 2: Pre-generate data locally
If you want to pre-build your data (skips the drag & drop step):

1. Place your `Uber Data` folder in the project root
2. Generate the data file:
   ```bash
   node generate_data.js
   ```
3. Run a local server:
   ```bash
   npx serve .
   ```

The app will automatically load from `data.js` if it exists.

## Deployment

This project is designed for static hosting on Cloudflare Pages:

1. Push to GitHub
2. Connect the repo to Cloudflare Pages
3. Deploy with default settings (no build command needed)

## Privacy

Your Uber data **never leaves your device**. All parsing and visualization happens entirely in the browser using JavaScript. There are no analytics, no tracking, and no external requests beyond loading the map tiles.

## License

MIT
