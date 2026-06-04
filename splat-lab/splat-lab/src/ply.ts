/**
 * Minimal binary-PLY parser for 3D Gaussian Splatting files.
 *
 * Reads the standard property layout (x,y,z, nx,ny,nz, f_dc_*, f_rest_*,
 * opacity, scale_*, rot_*) from a binary_little_endian PLY into a SplatData
 * struct. fRest is kept in source order (channel-blocked: ch*15+k for SH3).
 */

import type { SplatData } from "./compression.ts";

const TYPE_BYTES: Record<string, number> = {
  char: 1, uchar: 1, int8: 1, uint8: 1,
  short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4,
  double: 8, float64: 8,
};

interface Prop { name: string; type: string; offset: number; }

export function parsePly(buffer: ArrayBuffer): SplatData {
  const bytes = new Uint8Array(buffer);
  // Find end of header.
  const marker = "end_header\n";
  let headerEnd = -1;
  const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 100_000)));
  const idx = text.indexOf(marker);
  if (idx === -1) throw new Error("PLY: end_header not found");
  headerEnd = idx + marker.length;

  const header = text.slice(0, headerEnd).split("\n");
  let count = 0;
  const props: Prop[] = [];
  let offset = 0;
  for (const line of header) {
    const t = line.trim().split(/\s+/);
    if (t[0] === "element" && t[1] === "vertex") count = parseInt(t[2], 10);
    else if (t[0] === "property" && t[1] !== "list") {
      const type = t[1], name = t[2];
      props.push({ name, type, offset });
      offset += TYPE_BYTES[type] ?? 4;
    }
  }
  const stride = offset;
  const dv = new DataView(buffer, headerEnd);

  const propMap = new Map(props.map((p) => [p.name, p]));
  const read = (row: number, name: string): number => {
    const p = propMap.get(name);
    if (!p) return 0;
    const at = row * stride + p.offset;
    switch (p.type) {
      case "float": case "float32": return dv.getFloat32(at, true);
      case "double": case "float64": return dv.getFloat64(at, true);
      case "uchar": case "uint8": return dv.getUint8(at);
      default: return dv.getFloat32(at, true);
    }
  };

  const restNames = props.filter((p) => p.name.startsWith("f_rest_"))
    .sort((a, b) => parseInt(a.name.split("_")[2]) - parseInt(b.name.split("_")[2]))
    .map((p) => p.name);
  const coeffs = restNames.length;
  const shDegree = coeffs >= 45 ? 3 : coeffs >= 24 ? 2 : coeffs >= 9 ? 1 : 0;

  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count * 3);
  const rotations = new Float32Array(count * 4);
  const opacities = new Float32Array(count);
  const fDC = new Float32Array(count * 3);
  const fRest = new Float32Array(count * coeffs);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = read(i, "x"); positions[i * 3 + 1] = read(i, "y"); positions[i * 3 + 2] = read(i, "z");
    scales[i * 3] = read(i, "scale_0"); scales[i * 3 + 1] = read(i, "scale_1"); scales[i * 3 + 2] = read(i, "scale_2");
    rotations[i * 4] = read(i, "rot_0"); rotations[i * 4 + 1] = read(i, "rot_1");
    rotations[i * 4 + 2] = read(i, "rot_2"); rotations[i * 4 + 3] = read(i, "rot_3");
    opacities[i] = read(i, "opacity");
    fDC[i * 3] = read(i, "f_dc_0"); fDC[i * 3 + 1] = read(i, "f_dc_1"); fDC[i * 3 + 2] = read(i, "f_dc_2");
    for (let k = 0; k < coeffs; k++) fRest[i * coeffs + k] = read(i, restNames[k]);
  }

  return { count, positions, scales, rotations, opacities, fDC, fRest, shDegree };
}

/**
 * Serialize SplatData back to a binary_little_endian PLY ArrayBuffer.
 * Used to hand a freshly-compressed splat set to the renderer for re-display.
 */
export function serializePly(d: SplatData): ArrayBuffer {
  const coeffs = (d.fRest.length / d.count) | 0;
  const names = ["x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2",
    ...Array.from({ length: coeffs }, (_, i) => `f_rest_${i}`),
    "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"];
  const header =
    `ply\nformat binary_little_endian 1.0\nelement vertex ${d.count}\n` +
    names.map((n) => `property float ${n}`).join("\n") + "\nend_header\n";
  const headerBytes = new TextEncoder().encode(header);
  const stride = names.length * 4;
  const buf = new ArrayBuffer(headerBytes.length + d.count * stride);
  new Uint8Array(buf).set(headerBytes);
  const dv = new DataView(buf, headerBytes.length);
  for (let i = 0; i < d.count; i++) {
    let o = i * stride;
    const put = (v: number) => { dv.setFloat32(o, v, true); o += 4; };
    put(d.positions[i * 3]); put(d.positions[i * 3 + 1]); put(d.positions[i * 3 + 2]);
    put(0); put(0); put(0); // normals
    put(d.fDC[i * 3]); put(d.fDC[i * 3 + 1]); put(d.fDC[i * 3 + 2]);
    for (let k = 0; k < coeffs; k++) put(d.fRest[i * coeffs + k]);
    put(d.opacities[i]);
    put(d.scales[i * 3]); put(d.scales[i * 3 + 1]); put(d.scales[i * 3 + 2]);
    put(d.rotations[i * 4]); put(d.rotations[i * 4 + 1]); put(d.rotations[i * 4 + 2]); put(d.rotations[i * 4 + 3]);
  }
  return buf;
}
