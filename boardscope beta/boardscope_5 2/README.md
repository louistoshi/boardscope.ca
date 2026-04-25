# BoardScope — Professional PCB Board Repair Software

## Overview

BoardScope is a professional-grade PCB boardview and repair analysis software designed for electronics technicians, engineers, and repair professionals. It provides advanced tools for visualizing, analyzing, and troubleshooting printed circuit boards.

## Key Features

- **BoardView Visualization**: Interactive PCB boardview with component highlighting and search
- **Fault Tree Analysis**: Advanced diagnostic tools for identifying circuit faults
- **Component Library**: Comprehensive component database with specifications
- **Macro Recording**: Record and replay repair procedures
- **Multi-Platform Support**: Works on macOS, Windows, and Linux
- **Polar Integration**: Secure payment processing with webhook support

## Project Structure

```
boardscope_5 2/
├── boardview.html          # Main boardview application
├── electron-main.js        # Electron main process
├── preload.js              # Electron preload script
├── server.js               # Web server with Polar webhook endpoint
├── sw.js                   # Service worker for PWA
├── website/                # Marketing website
│   ├── index.html          # Landing page
│   ├── manual.html         # User manual
│   ├── pricing.html        # Pricing with Polar checkout
│   └── screenshots/        # App screenshots
├── data/                   # Board files and transaction data
├── scripts/                # Debug and parser scripts
├── docs/                   # Documentation
└── assets/                 # Icons and media
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation
```bash
# Clone the repository
cd boardscope_5 2

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building for Production
```bash
# Build the application
npm run build

# Create distributable packages
npm run package
```

## Polar Integration

BoardScope uses Polar.sh for payment processing. The webhook endpoint is configured in [`server.js`](server.js:1).

### Webhook Endpoint
- **URL**: `/webhook/polar`
- **Method**: POST
- **Events**: `checkout.completed`, `subscription.created`, `subscription.updated`

### Configuration
Set your Polar secret key in the environment:
```bash
export POLAR_WEBHOOK_SECRET=your_secret_key
```

## Usage

### Opening Board Files
1. Launch BoardScope
2. Click "Open Board" or drag a `.brd` file into the window
3. Navigate the board using mouse wheel and drag

### Component Search
- Press `Ctrl+F` to open search
- Type component name or reference designator
- Click result to highlight on board

### Fault Analysis
1. Select components on the board
2. Use the Fault Tree panel to analyze connections
3. Follow diagnostic paths to identify issues

## Development

### Code Structure
- **Electron Main Process**: [`electron-main.js`](electron-main.js:1)
- **Preload Script**: [`preload.js`](preload.js:1)
- **Service Worker**: [`sw.js`](sw.js:1)
- **Web Server**: [`server.js`](server.js:1)

### Adding New Features
1. Create feature branch from `main`
2. Implement changes with tests
3. Submit pull request for review

## Documentation

- **User Manual**: [`website/manual.html`](website/manual.html:1)
- **Building Guide**: [`BUILDING.md`](BUILDING.md:1)
- **Polar Setup**: [`POLAR_SETUP.md`](POLAR_SETUP.md:1)
- **BoardView Integration**: [`docs/BOARDVIEW_INTEGRATION_GUIDE.md`](docs/BOARDVIEW_INTEGRATION_GUIDE.md:1)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For support or questions:
- Check the [User Manual](website/manual.html:1)
- Review the [documentation](docs/)
- Contact: support@boardscope.com

## Acknowledgments

- Built with Electron
- Payment processing by Polar.sh
- BoardView technology by OpenBoardView
