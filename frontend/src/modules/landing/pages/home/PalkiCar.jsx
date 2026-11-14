import { useId } from 'react';

/**
 * PALKI's own vehicle illustrations — side view, facing right, drawn in the
 * brand palette (orange body, charcoal glass and tyres).
 *
 * Wheels and lights are separate groups so CSS can animate them: add
 * `driving` and the wheels spin and the body rides a slight suspension bob
 * (see `.pc-*` in palki-home.css). Everything is plain SVG, so a fleet of these
 * costs nothing to load and stays sharp at any size.
 */

const INK = '#2A2C33';
const RIM = '#D9DDE4';

function Wheel({ cx, cy, r }) {
  const spokes = [0, 72, 144, 216, 288];
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={r} fill={INK} />
      <circle r={r * 0.56} fill={RIM} />
      <g className="pc-spin">
        {spokes.map((a) => (
          <line
            key={a}
            x1="0"
            y1="0"
            x2={Math.cos((a * Math.PI) / 180) * r * 0.5}
            y2={Math.sin((a * Math.PI) / 180) * r * 0.5}
            stroke="#9AA1AD"
            strokeWidth={r * 0.13}
            strokeLinecap="round"
          />
        ))}
      </g>
      <circle r={r * 0.17} fill={INK} />
    </g>
  );
}

const glass = (id) => `url(#${id}-glass)`;
const paint = (id) => `url(#${id}-paint)`;

function Defs({ id, tone }) {
  const [from, to] = tone === 'ink' ? ['#4A4D57', '#2A2C33'] : ['#FF9A3C', '#F25A0D'];
  return (
    <defs>
      <linearGradient id={`${id}-paint`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={from} />
        <stop offset="1" stopColor={to} />
      </linearGradient>
      <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5B6170" />
        <stop offset="1" stopColor="#23252B" />
      </linearGradient>
    </defs>
  );
}

const Light = ({ d }) => <path className="pc-light" d={d} fill="#FFE3A3" />;
const Tail = ({ x, y, h = 7 }) => <rect x={x} y={y} width="5" height={h} rx="1.5" fill="#E5484D" />;
const Shadow = ({ cx, cy, rx }) => <ellipse cx={cx} cy={cy} rx={rx} ry="4.5" fill="#000" opacity="0.13" />;

const VARIANTS = {
  hatch: {
    box: [200, 96],
    draw: (id) => (
      <>
        <Shadow cx="102" cy="90" rx="88" />
        <g className="pc-body">
          <path
            fill={paint(id)}
            d="M16 70C14 58 18 50 28 48L44 46L60 26C64 22 70 20 78 20L120 20C136 20 148 28 160 42L178 46C188 48 192 54 192 62L192 70C192 74 189 76 185 76L165 76A15 15 0 0 0 135 76L67 76A15 15 0 0 0 37 76L22 76C18 76 16 74 16 70Z"
          />
          <path fill={glass(id)} d="M54 44L66 28C69 25 72 25 78 25L100 25L100 44Z" />
          <path fill={glass(id)} d="M106 25L122 25C134 26 142 32 152 44L106 44Z" />
          <path d="M26 53L188 53" stroke="#fff" strokeOpacity="0.28" strokeWidth="2" />
          <path d="M103 46V72" stroke={INK} strokeOpacity="0.18" strokeWidth="1.5" />
          <rect x="112" y="50" width="10" height="2.6" rx="1.3" fill={INK} opacity="0.35" />
          <Light d="M183 50L191 54L191 58L182 56Z" />
          <Tail x="16" y="54" />
        </g>
        <Wheel cx={52} cy={76} r={15} />
        <Wheel cx={150} cy={76} r={15} />
      </>
    ),
  },
  sedan: {
    box: [220, 96],
    draw: (id) => (
      <>
        <Shadow cx="114" cy="90" rx="98" />
        <g className="pc-body">
          <path
            fill={paint(id)}
            d="M16 70C14 58 20 52 32 50L64 45C76 30 92 22 112 22L140 22C158 22 170 30 182 44L200 48C210 50 214 56 214 64L214 70C214 74 211 76 207 76L181 76A15 15 0 0 0 151 76L73 76A15 15 0 0 0 43 76L22 76C18 76 16 74 16 70Z"
          />
          <path fill={glass(id)} d="M74 44C84 32 96 27 112 27L139 27L139 44Z" />
          <path fill={glass(id)} d="M145 27C160 28 168 34 176 44L145 44Z" />
          <path d="M28 54L206 54" stroke="#fff" strokeOpacity="0.28" strokeWidth="2" />
          <path d="M108 46V72M142 46V72" stroke={INK} strokeOpacity="0.18" strokeWidth="1.5" />
          <rect x="118" y="51" width="10" height="2.6" rx="1.3" fill={INK} opacity="0.35" />
          <rect x="152" y="51" width="10" height="2.6" rx="1.3" fill={INK} opacity="0.35" />
          <Light d="M204 52L213 56L213 60L203 58Z" />
          <Tail x="16" y="55" />
        </g>
        <Wheel cx={58} cy={76} r={15} />
        <Wheel cx={166} cy={76} r={15} />
      </>
    ),
  },
  suv: {
    box: [220, 100],
    draw: (id) => (
      <>
        <Shadow cx="114" cy="94" rx="100" />
        <g className="pc-body">
          <rect x="80" y="9" width="76" height="3.5" rx="1.75" fill={INK} />
          <path
            fill={paint(id)}
            d="M14 72L14 52C14 46 18 44 24 43L50 40L66 20C69 16 72 15 77 15L160 15C167 15 171 18 175 24L186 40L202 43C210 45 214 50 214 58L214 74C214 78 211 80 207 80L184 80A16 16 0 0 0 152 80L72 80A16 16 0 0 0 40 80L20 80C16 80 14 78 14 72Z"
          />
          <path fill={glass(id)} d="M58 40L71 22C72 21 74 20 76 20L104 20L104 40Z" />
          <path fill={glass(id)} d="M110 20L140 20L140 40L110 40Z" />
          <path fill={glass(id)} d="M146 20L159 20C163 20 166 22 168 26L178 40L146 40Z" />
          <path d="M22 52L208 52" stroke="#fff" strokeOpacity="0.28" strokeWidth="2" />
          <path d="M107 42V76M143 42V76" stroke={INK} strokeOpacity="0.18" strokeWidth="1.5" />
          <rect x="18" y="66" width="196" height="5" rx="2.5" fill={INK} opacity="0.22" />
          <Light d="M205 48L213 51L213 56L204 54Z" />
          <Tail x="14" y="50" h="9" />
        </g>
        <Wheel cx={56} cy={80} r={16} />
        <Wheel cx={168} cy={80} r={16} />
      </>
    ),
  },
  auto: {
    box: [190, 100],
    draw: (id) => (
      <>
        <Shadow cx="98" cy="94" rx="80" />
        <g className="pc-body">
          <path fill={INK} d="M22 44L22 20C22 14 26 10 32 10L126 10C134 10 140 14 142 20L150 44Z" />
          <path fill="#4A4D57" d="M32 18L94 18L94 42L32 42Z" />
          <path fill={glass(id)} d="M100 18L132 18L139 42L100 42Z" />
          <path
            fill={paint(id)}
            d="M18 44L150 44L172 66C176 70 176 78 170 80L164 80A14 14 0 0 0 136 80L60 80A14 14 0 0 0 32 80L22 80C19 80 18 78 18 75Z"
          />
          <path d="M97 44V78" stroke={INK} strokeOpacity="0.2" strokeWidth="1.5" />
          <rect x="22" y="52" width="70" height="4" rx="2" fill="#fff" opacity="0.3" />
          <Light d="M166 60L174 63L173 68L165 66Z" />
          <Tail x="18" y="50" />
        </g>
        <Wheel cx={46} cy={80} r={14} />
        <Wheel cx={150} cy={80} r={14} />
      </>
    ),
  },
  bike: {
    box: [160, 100],
    draw: (id, { cargo }) => (
      <>
        <Shadow cx="80" cy="94" rx="62" />
        <g className="pc-body">
          {cargo && (
            <g>
              <rect x="18" y="22" width="34" height="30" rx="4" fill="#E5530A" />
              <path d="M18 34H52" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" />
              <rect x="30" y="22" width="10" height="30" fill="#fff" opacity="0.18" />
            </g>
          )}
          <path d="M118 30L124 30M121 30L134 82" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <path
            fill={paint(id)}
            d="M22 76C22 64 34 58 50 58L88 58C96 58 100 62 104 68L112 72L124 56L131 60L119 80L38 82C28 82 22 80 22 76Z"
          />
          <path fill={INK} d="M42 54C42 49 48 47 56 47L84 47C90 47 92 51 90 55L42 55Z" />
          <Light d="M128 44L136 46L135 51L127 49Z" />
        </g>
        <Wheel cx={36} cy={84} r={14} />
        <Wheel cx={130} cy={84} r={14} />
      </>
    ),
  },
  bus: {
    box: [320, 110],
    draw: (id) => (
      <>
        <Shadow cx="162" cy="104" rx="150" />
        <g className="pc-body">
          <path
            fill={paint(id)}
            d="M10 86L10 22C10 14 16 10 24 10L292 10C302 10 306 16 308 26L314 66L314 86C314 90 311 92 307 92L270 92A16 16 0 0 0 238 92L82 92A16 16 0 0 0 50 92L16 92C12 92 10 90 10 86Z"
          />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={22 + i * 34} y="20" width="28" height="26" rx="3.5" fill={glass(id)} />
          ))}
          <rect x="230" y="20" width="26" height="58" rx="3.5" fill={glass(id)} />
          <path fill={glass(id)} d="M264 20L290 20C296 20 299 23 300 28L305 52L264 52Z" />
          <rect x="10" y="56" width="216" height="7" fill="#fff" opacity="0.9" />
          <text x="34" y="82" fill="#fff" fontSize="14" fontWeight="800" letterSpacing="2">PALKI</text>
          <Light d="M302 68L313 70L313 76L302 75Z" />
          <Tail x="10" y="66" h="10" />
        </g>
        <Wheel cx={66} cy={92} r={16} />
        <Wheel cx={254} cy={92} r={16} />
      </>
    ),
  },
};

export default function PalkiCar({
  variant = 'sedan',
  tone = 'orange',
  driving = false,
  cargo = false,
  className = '',
  title,
  ...rest
}) {
  const id = `pc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const v = VARIANTS[variant] || VARIANTS.sedan;
  const [w, h] = v.box;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`pc ${driving ? 'pc-driving' : ''} ${className}`}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...rest}
    >
      <Defs id={id} tone={tone} />
      {v.draw(id, { cargo })}
    </svg>
  );
}
