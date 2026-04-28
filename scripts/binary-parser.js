// Binary BRD Parser for BoardScope - Rebuilt based on actual file structure analysis
// Format: Apple 820-XXXX BRD binary format
//
// File Structure:
// - Fields separated by 0xf7
// - Net fields: contain 0x0d0a NOT at position 0 (separates net name from pin index)
// - Coord fields: start with 0x0d0a
// - Coordinates encoded as base4 digits
// - Each net field can have multiple groups of 3 coord fields (Y, X, side) after it

const CIPHER = {
  0xeb:'P', 0x6b:'P',
  0x6a:'V', 0xea:'V',
  0x6c:'N', 0xec:'N',
  0x6e:'D', 0xee:'D',
  0x2f:'C', 0xaf:'C',
  0x2e:'G', 0xae:'G',
  0x2a:'U', 0xaa:'U',
  0x2b:'S', 0xab:'S',
  0x28:'_', 0xa8:'_',
  0x6f:'O', 0xef:'O',
  0x6d:'M', 0xed:'M',
  0x69:'I', 0xe9:'I',
  0x2c:'R', 0xac:'R',
  0x2d:'H', 0xad:'H',
  0x29:'A', 0xa9:'A',
  0x23:'B', 0xa3:'B',
  0x26:'E', 0xa6:'E',
  0x24:'T', 0xa4:'T',
  0x63:'L', 0xe3:'L',
  0x64:'F', 0xe4:'F',
  0x62:'K', 0xe2:'K',
};

function decodeNet(data) {
  const result = [];
  for (const b of data) {
    if (CIPHER[b]) {
      result.push(CIPHER[b]);
    } else {
      const lb = b & 0x7F;
      for (const base of [0x30, 0x70, 0xb0, 0xf0]) {
        if (lb >= base && lb <= base + 9) {
          result.push(String(lb - base));
          break;
        }
      }
    }
  }
  return result.join('');
}

function decodeDigits(data) {
  const digits = [];
  for (const b of data) {
    if (b === 0xaa) continue;
    const lb = b & 0x7F;
    for (const base of [0x30, 0x70, 0xb0, 0xf0]) {
      if (lb >= base && lb <= base + 9) {
        digits.push(lb - base);
        break;
      }
    }
  }
  return digits;
}

function base4ToInt(digits) {
  let r = 0;
  for (const d of digits) r = r * 4 + d;
  return r;
}

// A field is a COORD field if it starts with 0x0d0a
function isCoordField(f) {
  return f.length >= 2 && f[0] === 0x0d && f[1] === 0x0a;
}

// A field is a NET field if it does NOT start with 0x0d0a but contains 0x0d0a somewhere inside
function isNetField(f) {
  if (f.length < 3) return false;
  if (isCoordField(f)) return false;
  // Look for 0x0d0a separator inside the field
  for (let j = 1; j < f.length - 1; j++) {
    if (f[j] === 0x0d && f[j+1] === 0x0a) return true;
  }
  return false;
}

function getNetInfo(f) {
  for (let j = 1; j < f.length - 1; j++) {
    if (f[j] === 0x0d && f[j+1] === 0x0a) {
      const netBytes = f.slice(0, j);
      const idxBytes = f.slice(j + 2);
      const netName = decodeNet(netBytes);
      const idxDigits = decodeDigits(idxBytes);
      const pinIdx = idxDigits.length > 0 ? base4ToInt(idxDigits) : -1;
      return { netName, pinIdx };
    }
  }
  return null;
}

function getCoordValue(f) {
  // For coord fields, skip the leading 0x0d0a and decode the rest
  const data = (f.length >= 2 && f[0] === 0x0d && f[1] === 0x0a) ? f.slice(2) : f;
  const digits = decodeDigits(data);
  return digits.length > 0 ? base4ToInt(digits) : 0;
}

function parseBinaryBRD(buffer) {
  console.log('[BinaryBRD] Parser called, buffer length:', buffer.length);

  // Handle input types
  let bytes;
  if (buffer instanceof Uint8Array) {
    bytes = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    bytes = new Uint8Array(buffer);
  } else if (typeof buffer === 'string') {
    bytes = new Uint8Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) bytes[i] = buffer.charCodeAt(i);
  } else {
    console.error('[BinaryBRD] Unknown buffer type');
    return { comps: [], outline: [] };
  }

  // Split file into fields by 0xf7 separator
  const fields = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xf7) {
      if (i > start) fields.push(bytes.slice(start, i));
      start = i + 1;
    }
  }
  if (start < bytes.length) fields.push(bytes.slice(start));
  
  console.log('[BinaryBRD] Fields extracted:', fields.length);

  // Classify each field
  const fieldTypes = fields.map((f, i) => {
    if (isNetField(f)) return 'net';
    if (isCoordField(f)) return 'coord';
    return 'other';
  });

  // Find all net field indices
  const netFieldIndices = [];
  for (let i = 0; i < fields.length; i++) {
    if (fieldTypes[i] === 'net') {
      netFieldIndices.push(i);
    }
  }
  console.log('[BinaryBRD] Net fields found:', netFieldIndices.length);

  // Parse pins: for each net field, read groups of 3 coord fields until the next net field
  // Structure: net_field -> (Y, X, side) * N -> next_net_field -> ...
  // Note: coord fields are interspersed with "other" fields, so we need to skip non-coord fields
  const pins = [];
  let lastNetName = '';
  
  for (let i = 0; i < netFieldIndices.length; i++) {
    const netIdx = netFieldIndices[i];
    const nextNetIdx = i + 1 < netFieldIndices.length ? netFieldIndices[i+1] : fields.length;
    
    const netField = fields[netIdx];
    const info = getNetInfo(netField);
    if (!info || info.pinIdx < 0) continue;
    
    const netName = info.netName || lastNetName;
    lastNetName = netName;
    
    // Collect all coord field indices between this net field and the next
    const coordFieldsBetween = [];
    for (let j = netIdx + 1; j < nextNetIdx; j++) {
      if (fieldTypes[j] === 'coord') {
        coordFieldsBetween.push(j);
      }
    }
    
    // Process coord fields in groups of 3 (Y, X, side)
    let pinCounter = 0;
    for (let c = 0; c + 2 < coordFieldsBetween.length; c += 3) {
      const yIdx = coordFieldsBetween[c];
      const xIdx = coordFieldsBetween[c + 1];
      const sIdx = coordFieldsBetween[c + 2];
      
      const y = getCoordValue(fields[yIdx]);
      const x = getCoordValue(fields[xIdx]);
      const sideVal = getCoordValue(fields[sIdx]);
      const side = (sideVal % 2 === 0) ? 'T' : 'B';
      
      const pinIdx = info.pinIdx + pinCounter;
      
      pins.push({
        id: `PIN_${pinIdx}`,
        index: pinIdx,
        x: x,
        y: y,
        side: side,
        net: netName,
        radius: 4,
        num: '',
        name: '',
      });
      
      pinCounter++;
    }
  }
  
  console.log('[BinaryBRD] Pins extracted:', pins.length);

  // Build components by clustering pins spatially
  // Pins on the same net that are close together belong to the same component
  function clusterPins(pinArray, threshold) {
    const clusters = [];
    const visited = new Set();
    
    for (let i = 0; i < pinArray.length; i++) {
      if (visited.has(i)) continue;
      
      const cluster = [pinArray[i]];
      visited.add(i);
      
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < pinArray.length; j++) {
          if (visited.has(j)) continue;
          for (const cp of cluster) {
            if (Math.hypot(cp.x - pinArray[j].x, cp.y - pinArray[j].y) < threshold) {
              cluster.push(pinArray[j]);
              visited.add(j);
              changed = true;
              break;
            }
          }
        }
      }
      
      if (cluster.length > 0) clusters.push(cluster);
    }
    
    return clusters;
  }

  // Group pins by net first
  const netGroups = new Map();
  for (const pin of pins) {
    if (!netGroups.has(pin.net)) netGroups.set(pin.net, []);
    netGroups.get(pin.net).push(pin);
  }

  // Build components by clustering pins within each net
  const comps = [];
  let compIdx = 0;
  
  for (const [net, netPins] of netGroups) {
    if (netPins.length === 0) continue;
    
    // Cluster threshold: 30 units (pins on same component are close together)
    const clusters = clusterPins(netPins, 30);
    
    for (const cluster of clusters) {
      if (cluster.length === 0) continue;
      
      const avgX = cluster.reduce((a, p) => a + p.x, 0) / cluster.length;
      const avgY = cluster.reduce((a, p) => a + p.y, 0) / cluster.length;
      const side = cluster[0].side;
      
      // Generate component reference from net name
      const ref = `NET_${net.replace(/[^A-Z0-9]/g, '_').substring(0, 12)}_${++compIdx}`;
      
      comps.push({
        ref: ref,
        x: avgX,
        y: avgY,
        side: side,
        mount: 'SMD',
        pins: cluster.map((p, idx) => ({
          id: `${ref}-${idx+1}`,
          num: String(idx+1),
          net: p.net,
          x: p.x,
          y: p.y,
          radius: 4,
          side: p.side,
          name: '',
          type: '',
          comment: '',
          outline: [],
        })),
        outline: [],
      });
    }
  }
  
  console.log('[BinaryBRD] Components created:', comps.length);

  // Build board outline from pin extents
  const outline = [];
  if (pins.length > 0) {
    const xs = pins.map(p => p.x);
    const ys = pins.map(p => p.y);
    const minX = Math.min(...xs) - 10;
    const maxX = Math.max(...xs) + 10;
    const minY = Math.min(...ys) - 10;
    const maxY = Math.max(...ys) + 10;
    
    outline.push({x: minX, y: minY});
    outline.push({x: maxX, y: minY});
    outline.push({x: maxX, y: maxY});
    outline.push({x: minX, y: maxY});
    outline.push({x: minX, y: minY});
  }

  return { comps, outline };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseBinaryBRD, CIPHER, decodeNet, decodeDigits, base4ToInt, isNetField, isCoordField, getNetInfo, getCoordValue };
}
