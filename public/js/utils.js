export function hsvToRgb(h, s, v) {
  let c = v * s; // chroma
  let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let m = v - c;
  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  // convert to 0–255 range
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return [r, g, b];
}

/**
 * Determines the appropriate text color (white or nodeColor) based on the cell's background color.
 * * @param {string} cellColor - The background color of the adjacency cell.
 * @param {string} nodeColor - The color to use for dark text (e.g., 'var(--node-color)').
 * @returns {string} 'white' for dark backgrounds, or the provided nodeColor for light backgrounds.
 */
export function getTextColor(cellColor, nodeColor) {
  // 1. Clean and extract the content inside the parentheses
  const start = cellColor.indexOf("(") + 1;
  const end = cellColor.indexOf(")");
  const content = cellColor.slice(start, end).trim();

  // 2. Split by comma and convert to numbers (R, G, B)
  const parts = content.split(",").map((p) => parseFloat(p.trim()));

  // Ensure we have three valid numbers
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.warn(
      `Failed to parse RGB values from: ${cellColor}. Defaulting to white.`
    );
    return "white";
  }

  const [r, g, b] = parts;

  // 3. Calculate Relative Luminance (a good proxy for perceived lightness)
  // Formula: (0.299*R + 0.587*G + 0.114*B) / 255.
  // Luminance values range from 0 (black) to 1 (white).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // 4. Set the contrast threshold
  const threshold = 0.6;

  if (luminance > threshold) {
    // Light background -> Use dark text
    return nodeColor;
  } else {
    // Dark background -> Use light text
    return "white";
  }
}
