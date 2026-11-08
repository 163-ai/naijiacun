export const LAUGH_DURATION = 4.7;

function seg(t, a, b) { return Math.min(1, Math.max(0, (t - a) / (b - a))); }
function easeOut(x) { var p = 1 - Math.min(1, Math.max(0, x)); return 1 - p * p * p; }
function easeIn(x) { var p = Math.min(1, Math.max(0, x)); return p * p; }

// Shared with the existing 3D showcase: shake, fall, roll, then stand up.
export function getLaughPose(t) {
  var lean = 0, roll = 0, shake = 0, squash = 0, lift = 0, turn = 0;
  if (t < 1.7) {
    lean = 0.26 * easeOut(seg(t, 0, 0.6)) + 0.1 * easeOut(seg(t, 0.6, 1.7));
    shake = (0.016 + 0.06 * seg(t, 0.4, 1.0)) * Math.sin(t * Math.PI * 2 * 5.6);
    var beat = Math.max(0, Math.sin(t * Math.PI * 2 * 2.8));
    squash = 0.06 * beat;
    lift = 0.045 * beat;
  } else if (t < 2.3) {
    var p = easeIn(seg(t, 1.7, 2.25));
    lean = 0.36 + 0.14 * p;
    roll = 1.45 * p;
    shake = 0.025 * (1 - p) * Math.sin(t * Math.PI * 2 * 6.4);
  } else if (t < 3.6) {
    lean = 0.5 + 0.05 * Math.sin((t - 2.3) * Math.PI * 2 * 1.4);
    roll = 1.45 + 0.17 * Math.sin((t - 2.3) * Math.PI * 2 * 0.8);
    turn = 0.14 * Math.sin((t - 2.3) * Math.PI * 2 * 0.55);
    lift = 0.022 * Math.max(0, Math.sin((t - 2.3) * Math.PI * 2 * 3));
  } else if (t < 4.4) {
    var q = easeOut(seg(t, 3.6, 4.3));
    lean = 0.5 * (1 - q);
    roll = 1.45 * (1 - q);
    turn = 0.1 * (1 - q);
  } else {
    lean = 0.04 * Math.max(0, Math.sin((t - 4.4) * Math.PI * 2 * 4)) * (1 - seg(t, 4.4, 4.7));
  }
  return { lean, roll, shake, squash, lift, turn };
}
