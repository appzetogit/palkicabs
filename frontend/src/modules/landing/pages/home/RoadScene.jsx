import { motion as Motion, useReducedMotion } from 'framer-motion';
import { MapPin, Navigation } from 'lucide-react';
import PalkiCar from './PalkiCar';

/**
 * Hero visual, built from the logo's idea: a dark road with a dashed centre
 * line winding up to an orange map pin. The road draws itself in, a car drives
 * along it on a loop, the pin pulses, and a side-view car rolls along a road
 * strip in the foreground.
 *
 * The car follows the road with SVG <animateMotion> (rotate="auto"), so it
 * stays glued to the curve at any size. With reduced motion everything renders
 * in its final, still state.
 */

const ROAD = 'M-30 486C96 486 150 392 232 362S362 330 384 250S428 138 476 118';

function TopCar() {
  // Top-down car facing +x, centred on 0,0 so animateMotion rotates it in place.
  return (
    <g>
      <rect x="-19" y="-11" width="38" height="22" rx="7" fill="#F25A0D" />
      <path d="M2-9Q9-9 11-4L11 4Q9 9 2 9Z" fill="#2A2C33" />
      <path d="M-10-8Q-14-6-14 0Q-14 6-10 8L-8 8L-8-8Z" fill="#2A2C33" opacity="0.85" />
      <rect x="-7" y="-8" width="8" height="16" rx="2.5" fill="#FF9A3C" />
      <rect x="16" y="-9" width="3" height="4" rx="1" fill="#FFE3A3" />
      <rect x="16" y="5" width="3" height="4" rx="1" fill="#FFE3A3" />
    </g>
  );
}

export default function RoadScene() {
  const still = useReducedMotion();

  return (
    <div className="ph-scene" aria-hidden="true">
      <div className="ph-scene-map">
        <svg viewBox="0 0 520 520" className="ph-scene-svg" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="ph-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#F3D9C6" strokeWidth="1" />
            </pattern>
            <radialGradient id="ph-glow" cx="0.9" cy="0.2" r="0.6">
              <stop offset="0" stopColor="#FFB27A" stopOpacity="0.55" />
              <stop offset="1" stopColor="#FFB27A" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="520" height="520" fill="#FFF8F2" />
          <rect width="520" height="520" fill="url(#ph-grid)" />
          <rect width="520" height="520" fill="url(#ph-glow)" />

          {/* city blocks */}
          {[
            [40, 60, 90, 60], [160, 40, 70, 90], [300, 40, 60, 50], [60, 190, 80, 70],
            [400, 330, 90, 70], [250, 420, 100, 70], [420, 230, 70, 50], [30, 320, 70, 60],
          ].map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} rx="10" fill={i % 3 ? '#FBE7D8' : '#F7DCC7'} />
          ))}
          <circle cx="330" cy="140" r="28" fill="#E3F1DF" />
          <circle cx="120" cy="420" r="34" fill="#E3F1DF" />

          {/* road */}
          <Motion.path
            d={ROAD}
            fill="none"
            stroke="#2A2C33"
            strokeWidth="44"
            strokeLinecap="round"
            initial={still ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, ease: [0.65, 0, 0.35, 1], delay: 0.2 }}
          />
          <Motion.path
            d={ROAD}
            fill="none"
            stroke="#3B3E47"
            strokeWidth="36"
            strokeLinecap="round"
            initial={still ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, ease: [0.65, 0, 0.35, 1], delay: 0.25 }}
          />
          <Motion.g
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.4 }}
          >
            <path
              d={ROAD}
              fill="none"
              stroke="#fff"
              strokeWidth="3.5"
              strokeDasharray="14 14"
              strokeLinecap="round"
              className={still ? '' : 'ph-road-dash'}
            />
            {/* car on the road */}
            <g>
              {!still && (
                <animateMotion dur="7s" repeatCount="indefinite" rotate="auto" path={ROAD} begin="1.6s" />
              )}
              <g transform={still ? 'translate(232 362) rotate(-25)' : undefined}>
                <TopCar />
              </g>
            </g>
          </Motion.g>

          {/* destination pin */}
          <g transform="translate(476 118)">
            {!still && <ellipse className="ph-pin-pulse" rx="26" ry="9" fill="none" stroke="#FF6A13" strokeWidth="2" />}
            <ellipse rx="12" ry="4.5" fill="#000" opacity="0.15" />
            <Motion.g
              initial={still ? false : { y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1.7, type: 'spring', stiffness: 260, damping: 14 }}
            >
              <path
                d="M0 0C-4-12-22-22-22-40A22 22 0 0 1 22-40C22-22 4-12 0 0Z"
                fill="#FF6A13"
              />
              <circle cy="-40" r="8.5" fill="#fff" />
            </Motion.g>
          </g>

          {/* pickup dot */}
          <g transform="translate(70 470)">
            <circle r="13" fill="#FF6A13" opacity="0.2" className={still ? '' : 'ph-dot-pulse'} />
            <circle r="7" fill="#fff" stroke="#FF6A13" strokeWidth="4" />
          </g>
        </svg>

        <Motion.div
          className="ph-chip ph-chip-pickup"
          initial={still ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.9 }}
        >
          <span className="ph-chip-icon"><Navigation size={14} /></span>
          <span>
            <small>Pickup</small>
            <strong>Driver 3 min away</strong>
          </span>
        </Motion.div>

        <Motion.div
          className="ph-chip ph-chip-drop"
          initial={still ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.1 }}
        >
          <span className="ph-chip-icon ph-chip-icon-ink"><MapPin size={14} /></span>
          <span>
            <small>Drop</small>
            <strong>Fare locked upfront</strong>
          </span>
        </Motion.div>
      </div>

      <div className="ph-scene-strip">
        <div className={`ph-strip-road ${still ? '' : 'is-moving'}`} />
        <Motion.div
          className="ph-strip-car"
          initial={still ? false : { x: '-120%' }}
          animate={{ x: 0 }}
          transition={{ delay: 0.4, duration: 1.4, ease: [0.16, 0.84, 0.28, 1] }}
        >
          <PalkiCar variant="sedan" driving={!still} />
          {!still && (
            <span className="ph-speed" aria-hidden="true">
              <i /><i /><i />
            </span>
          )}
        </Motion.div>
      </div>
    </div>
  );
}
