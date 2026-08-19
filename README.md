# 🌍 Google Timeline Visualizer

A static web page that visualizes your Google Timeline data as an animated travel video. Export to MP4 directly in your browser - no server required!

## ✨ Features

- 📁 **Load Timeline.json** - Drag & drop or browse for your Google Timeline file
- 🗺️ **Interactive Map** - Beautiful Leaflet.js map with CARTO tiles
- 🎬 **Animated Route** - Watch your travels come to life with smooth animations
- 📹 **Export MP4** - Download your travel video directly in the browser
- 📱 **Adaptive** - Works on both desktop and mobile devices
- 🔒 **Privacy First** - Your data never leaves your device

## 🚀 Demo

[Live Demo](https://yourusername.github.io/timeline-visualizer/)

## 📋 Supported Timeline Formats

- Current Android/iOS direct-array exports
- Older `{ "semanticSegments": [...] }` exports
- Timeline paths, activities, and visits
- String, latLng, degree, geo:, and E7 coordinates

## 🛠️ Tech Stack

- **Map**: [Leaflet.js](https://leafletjs.com/) with CARTO tiles
- **Video Export**: [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)
- **Styling**: Custom CSS with CSS Variables
- **No Build Tools** - Pure vanilla JavaScript

## 📦 Installation

### Quick Start (GitHub Pages)

1. Fork this repository
2. Go to Settings → Pages
3. Select branch: `main`
4. Your site will be at: `https://yourusername.github.io/timeline-visualizer/`

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/timeline-visualizer.git

# Navigate to directory
cd timeline-visualizer

# Start a local server (Python)
python -m http.server 8000

# Or using Node.js
npx serve .

# Or using PHP
php -S localhost:8000
```

Open `http://localhost:8000` in your browser.

## 📱 How to Get Your Timeline.json

### Android

1. Open **Settings** → **Location** → **Location services** → **Timeline**
2. Select **Export Timeline data**
3. Save the JSON file

### iPhone

1. Open **Google Maps** → Profile picture → **Settings**
2. Go to **Personal content** → **Export Timeline data**
3. Transfer the JSON file to your computer

## 🎬 Usage

1. **Load Timeline**: Drag & drop your `Timeline.json` file or click to browse
2. **Configure Settings**:
   - Select date range
   - Set animation duration (10-300 seconds)
   - Choose resolution (480p, 720p, 1080p)
   - Add a title for your video
3. **Preview**: Click "Preview" to see the animation
4. **Export**: Click "Export MP4" to create your video
5. **Download**: Save the video to your device

## 📊 Adaptive Memory Management

The app automatically detects your device capabilities and adjusts:

| Device Tier | RAM | Max Points | Export Quality |
|-------------|-----|------------|----------------|
| **High** | 16GB+ | 200,000 | 1080p |
| **Medium** | 6-8GB | 100,000 | 720p |
| **Low** | 3-4GB | 30,000 | 480p |

Large timelines are automatically subsampled to prevent crashes.

## 🎨 Customization

### Change Colors

Edit `css/style.css`:

```css
:root {
    --primary-color: #ff0055;  /* Change this */
}
```

### Change Map Style

Edit `js/map-renderer.js`:

```javascript
// Different tile providers:
this.tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';  // OSM
this.tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png';  // Dark mode
```

## ⚠️ Limitations

- **Browser Memory**: Very large timelines (200K+ points) may be subsampled
- **Export Speed**: Video encoding happens in your browser - may take a few minutes
- **Browser Support**: Best results in Chrome/Edge (Safari may be slower)

## 🔒 Privacy

- **No server** - Everything runs locally in your browser
- **No upload** - Your Timeline data stays on your device
- **No tracking** - No analytics or tracking scripts
- **Open source** - Verify the code yourself

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Credits

- [Leaflet.js](https://leafletjs.com/) - Map library
- [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) - Video encoding
- [CARTO](https://carto.com/) - Map tiles
- [OpenStreetMap](https://www.openstreetmap.org/) - Map data

## 📧 Contact

If you have any questions or feedback, please open an issue on GitHub.

---

Made with ❤️ for travelers
