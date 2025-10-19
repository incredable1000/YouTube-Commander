# YouTube Commander

Take full command of your YouTube experience with quality control, custom navigation, and playback features.

## Features

- **Quality Controls**: Advanced video quality management
- **Audio Track Controls**: Multi-language audio track switching
- **Playback Controls**: Enhanced video playback features
- **Playlist Controls**: Advanced playlist management
- **Seek Controls**: Precise video seeking
- **Video Rotation**: Rotate videos for better viewing
- **Shorts Counter**: Track YouTube Shorts viewing
- **Watched History**: Comprehensive viewing history with Google Drive backup
- **Scroll to Top**: Quick navigation enhancement

## Development Setup

This project uses Vite with the `vite-plugin-web-extension` for modern Chrome extension development.

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Clone the repository** (if not already done)

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```
   This will:
   - Start Vite dev server with hot reload
   - Build the extension to `dist/` directory
   - Watch for file changes and rebuild automatically

4. **Load extension in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` directory

### Build for Production

```bash
npm run build
```

This creates an optimized build in the `dist/` directory ready for distribution.

## Project Structure

```
src/
├── manifest.json          # Extension manifest
├── background/
│   └── background.js      # Service worker
├── content/
│   ├── audioTrackControls.js
│   ├── playbackControls.js
│   ├── qualityControls.js
│   ├── seekControls.js
│   ├── scrollToTop.js
│   ├── shortsCounter.js
│   ├── videoRotation.js
│   ├── watchedHistory.js
│   └── ...               # Other content scripts
├── popup/
│   ├── popup.html        # Extension popup
│   └── popup.js          # Popup logic
├── styles/
│   ├── styles.css        # Main styles
│   └── scrollToTop.css   # Scroll to top styles
├── assets/
│   └── icon.png          # Extension icon
└── scroll_to_top.html    # Scroll to top page
```

## Development Features

- **Hot Reload**: Changes are automatically reflected in the extension
- **ES Modules**: Modern JavaScript module system
- **TypeScript Support**: Full TypeScript support (rename .js to .ts)
- **Source Maps**: Debug with original source code
- **Tree Shaking**: Optimized builds with unused code removal
- **Modern Build Pipeline**: Powered by Vite and Rollup

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Browser Compatibility

- Chrome (Manifest V3)
- Edge (Chromium-based)
- Other Chromium-based browsers

## Contributing

1. Make changes in the `src/` directory
2. Test with `npm run dev`
3. Build with `npm run build` before committing
4. Follow the existing code style and structure

## License

MIT License
