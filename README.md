# Bitify

<p align="center">
  <img src="./bitify_show_image.png" alt="Bitify preview" width="1040">
</p>

Bitify is a local web utility for converting PNG icons into BMP files for binary-alpha workflows. It is designed for assets that break when semi-transparent edge pixels are preserved and need to be rebuilt into clean on/off transparency.

## Features

- Batch PNG upload with drag and drop
- Binary-alpha BMP conversion in the browser
- Edge-aware pixel cleanup for thin borders and small icons
- Original vs processed preview
- Individual BMP download
- ZIP export with individual BMP files and a horizontal tile sheet BMP

## Tech Stack

- React
- Vite
- Tailwind CSS
- TypeScript

## Getting Started

```bash
npm install
npm run dev
```

Open the local Vite URL in your browser, add PNG files, tune the conversion sliders, and download the BMP results.

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run preview
```

## License

ISC
