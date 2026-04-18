#!/usr/bin/env node
/**
 * Icon generation script for Lexicon
 * Converts SVG to platform-specific formats: PNG, ICO (Windows), ICNS (macOS)
 * 
 * Run: node scripts/generate-icons.js
 * Or: npm run generate-icons
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const resourcesDir = path.join(__dirname, '../resources')
const svgFile = path.join(resourcesDir, 'icon.svg')

// Ensure resources directory exists
if (!existsSync(resourcesDir)) {
  mkdirSync(resourcesDir, { recursive: true })
  console.log(`Created resources directory: ${resourcesDir}`)
}

console.log('Generating Lexicon app icons...\n')

try {
  // Check if ImageMagick or compatible tools are available
  const hasMagick = (() => {
    try {
      execSync('magick -version', { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  })()

  if (!hasMagick) {
    console.warn('ImageMagick not found. Manual icon conversion required.')
    console.warn('Install ImageMagick and rerun: npm run generate-icons\n')
    console.log('For Windows: https://imagemagick.org/script/download.php#windows')
    console.log('For macOS: brew install imagemagick')
    console.log('For Linux: sudo apt-get install imagemagick\n')
    
    console.log('Alternatively, use an online converter:')
    console.log('- https://convertio.co/svg-png/')
    console.log('- https://convertio.co/png-ico/')
    console.log('- https://convertio.co/png-icns/\n')
    
    console.log('Required files:')
    console.log('- resources/icon.png (256x256)')
    console.log('- resources/icon.ico (Windows)')
    console.log('- resources/icon.icns (macOS)')
    process.exit(0)
  }

  // Generate PNG icons
  const pngSizes = [16, 32, 64, 128, 256, 512]
  for (const size of pngSizes) {
    const outFile = path.join(resourcesDir, `icon-${size}x${size}.png`)
    execSync(`magick "${svgFile}" -background none -resize ${size}x${size} "${outFile}"`)
    console.log(`Generated: icon-${size}x${size}.png`)
  }

  // Generate 256x256 as main icon.png
  const mainPng = path.join(resourcesDir, 'icon.png')
  execSync(`magick "${svgFile}" -background none -resize 256x256 "${mainPng}"`)
  console.log('Generated: icon.png (256x256)\n')

  // Generate Windows ICO (favicon.ico for bundling)
  const icoFile = path.join(resourcesDir, 'icon.ico')
  execSync(`magick "${mainPng}" -define icon:auto-resize=256,128,96,64,48,32,16 "${icoFile}"`)
  console.log('Generated: icon.ico (Windows)\n')

  // Generate macOS ICNS
  const icnsFile = path.join(resourcesDir, 'icon.icns')
  execSync(`magick "${svgFile}" -background none -define colorspace:auto-grayscale=off -resize 512x512 "${icnsFile}"`)
  console.log('Generated: icon.icns (macOS)\n')

  console.log('Icon generation complete!')
  console.log(`All icons are in: ${resourcesDir}`)

} catch (err) {
  console.error('Error generating icons:', err.message)
  process.exit(1)
}
