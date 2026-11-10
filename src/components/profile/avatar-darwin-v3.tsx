"use client"

import { useId, type ReactNode, type Ref } from "react"

// Финальный контур Варианта №3 (100% скругленный в стиле Дарвина)
export const DARWIN_V3_BODY_PATH = "M 343 76 L 346 76 Q 634 76, 634 364 L 634 610 Q 634 668, 576 668 L 576 668 Q 518 668, 518 610 L 518 578 Q 518 562, 502 562 L 502 562 Q 486 562, 486 578 L 486 882 Q 486 906, 510 906 L 535 906 Q 604 906, 604 975 L 604 975 Q 604 1044, 535 1044 L 436 1044 Q 378 1044, 378 986 L 378 599.5 Q 378 566, 344.5 566 L 344.5 566 Q 311 566, 311 599.5 L 311 986 Q 311 1044, 253 1044 L 154 1044 Q 85 1044, 85 975 L 85 975 Q 85 906, 154 906 L 179 906 Q 203 906, 203 882 L 203 578 Q 203 562, 187 562 L 187 562 Q 171 562, 171 578 L 171 610 Q 171 668, 113 668 L 113 668 Q 55 668, 55 610 L 55 364 Q 55 76, 343 76 Z";

export const AVATAR_SKINS = {
  sky: { name: 'Sky Bot (База)', body: '#34BDF2', accent: '#FFD166', cost: 0 },
  darwin: { name: 'Дарвин (Гамбол)', body: '#FF6B1A', accent: '#2ECC71', cost: 3 },
  invincible: { name: 'Неуязвимый', body: '#29B6F6', accent: '#FFD600', cost: 4 },
  meme67: { name: 'Мем 67 (Джерси)', body: '#34BDF2', accent: '#FF3B5C', cost: 3 },
  spidey: { name: 'Паучок', body: '#E63946', accent: '#1D3557', cost: 4 },
  shinobi: { name: 'Шиноби', body: '#FF7B00', accent: '#1E293B', cost: 3 },
  beskar: { name: 'Мандалорец', body: '#7A8B99', accent: '#D97724', cost: 4 },
  edgerunner: { name: 'Кибер-Раннер', body: '#FCEE09', accent: '#00F0FF', cost: 4 }
} as const;

export type AvatarSkinId = keyof typeof AVATAR_SKINS
export type AvatarEyeStyle = 'classic' | 'darwin_eyes' | 'goggles' | 'spidey_eyes'
export type AvatarHeadStyle = 'none' | 'fin' | 'headband67' | 'ninja_band' | 'hero_hair' | 'antenna'
export type AvatarChestStyle = 'none' | 'strap' | 'blush' | 'i_logo' | 'num67' | 'spider_icon'

interface AvatarDarwinV3Props {
  skin?: AvatarSkinId
  eye?: AvatarEyeStyle
  head?: AvatarHeadStyle
  chest?: AvatarChestStyle
  className?: string
  viewBox?: string
  bodyColor?: string
  eyeColor?: string
  animate?: boolean
  characterRef?: Ref<SVGSVGElement>
  gazeRef?: Ref<SVGGElement>
  eyelidsRef?: Ref<SVGGElement>
  children?: ReactNode
}

export default function AvatarDarwinV3({
  skin = 'sky',
  eye = 'classic',
  head = 'none',
  chest = 'none',
  className = 'w-48 h-auto',
  viewBox = '0 0 689 1060',
  bodyColor,
  eyeColor = '#FFFFFF',
  animate = false,
  characterRef,
  gazeRef,
  eyelidsRef,
  children,
}: AvatarDarwinV3Props) {
  const baseSkin = AVATAR_SKINS[skin] || AVATAR_SKINS.sky;
  const s = { ...baseSkin, body: bodyColor || baseSkin.body };
  const instanceId = useId().replace(/:/g, "");
  const clipId = `tlc-avatar-clip-${instanceId}`;

  return (
    <svg ref={characterRef} viewBox={viewBox} className={className} role="img" aria-label="Персонаж с выбранными цветами" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id={clipId}>
          <path d={DARWIN_V3_BODY_PATH} fill="#ffffff" />
        </clipPath>
      </defs>

      <g className={animate ? "avatar-breath" : undefined}>
      {children}
      {/* Задний слой (плавник Дарвина или плащ) */}
      {head === 'fin' && (
        <g>
          <ellipse cx="595" cy="245" rx="68" ry="36" transform="rotate(-24 595 245)" fill={s.body} />
          <ellipse cx="605" cy="295" rx="58" ry="32" transform="rotate(14 605 295)" fill={s.body} />
        </g>
      )}
      {chest === 'strap' && (
        <rect x="115" y="420" width="458" height="445" rx="64" fill="#37474F" />
      )}

      {/* Базовое тело с единым мультяшным контуром */}
      <path d={DARWIN_V3_BODY_PATH} fill={s.body} stroke="#1a293e" strokeWidth="14" strokeLinejoin="round" />

      {/* Скин и обувь внутри маски */}
      <g clipPath={`url(#${clipId})`}>
        {skin === 'darwin' && (
          <>
            <ellipse cx="344.5" cy="585" rx="185" ry="42" fill="#E05206" fillOpacity="0.35" />
            <rect x="70" y="885" width="550" height="170" rx="36" fill="#2ECC71" />
            <rect x="180" y="868" width="145" height="36" rx="18" fill="#FFFFFF" />
            <rect x="364" y="868" width="145" height="36" rx="18" fill="#FFFFFF" />
            <rect x="70" y="998" width="550" height="60" fill="#FFFFFF" />
          </>
        )}
        {skin === 'invincible' && (
          <>
            <ellipse cx="344.5" cy="210" rx="340" ry="185" fill="#FFD600" />
            <rect x="45" y="595" width="135" height="140" rx="36" fill="#1C2230" />
            <rect x="509" y="595" width="135" height="140" rx="36" fill="#1C2230" />
            <rect x="70" y="820" width="550" height="240" fill="#1C2230" />
            <rect x="70" y="920" width="550" height="140" fill="#29B6F6" />
          </>
        )}
        {skin === 'meme67' && (
          <>
            <rect x="171" y="340" width="347" height="260" rx="42" fill="#192132" />
            <circle cx="344.5" cy="336" r="54" fill="#34BDF2" />
            <path d="M 290 340 A 54 54 0 0 0 399 340" fill="none" stroke="#FF3B5C" strokeWidth="18" strokeLinecap="round" />
            <rect x="70" y="895" width="550" height="160" fill="#192132" />
            <rect x="70" y="1002" width="550" height="50" fill="#FFFFFF" />
          </>
        )}
        {skin === 'spidey' && (
          <>
            <rect x="45" y="545" width="598" height="515" fill="#1D3557" />
            <ellipse cx="344.5" cy="545" rx="185" ry="45" fill="#E63946" />
            <rect x="45" y="595" width="130" height="140" fill="#E63946" />
            <rect x="514" y="595" width="130" height="140" fill="#E63946" />
            <rect x="70" y="885" width="550" height="175" fill="#E63946" />
          </>
        )}
        {skin === 'shinobi' && (
          <>
            <rect x="45" y="335" width="598" height="90" rx="45" fill="#1E293B" />
            <rect x="70" y="895" width="550" height="160" fill="#1E293B" />
            <rect x="190" y="745" width="130" height="46" rx="23" fill="#FFFFFF" />
          </>
        )}

        {/* Детали груди */}
        {chest === 'blush' && (
          <>
            <ellipse cx="195" cy="318" rx="34" ry="20" fill="#FF3B5C" fillOpacity="0.45" />
            <ellipse cx="494" cy="318" rx="34" ry="20" fill="#FF3B5C" fillOpacity="0.45" />
            <path d="M 308 312 A 42 36 0 0 0 381 312" fill="none" stroke="#1C2230" strokeWidth="22" strokeLinecap="round" />
          </>
        )}
        {chest === 'i_logo' && (
          <>
            <ellipse cx="344.5" cy="348" rx="46" ry="34" fill="#1C2230" />
            <rect x="298.5" y="376" width="92" height="235" rx="46" fill="#FFD600" />
          </>
        )}
        {chest === 'num67' && (
          <>
            <path d="M 312 415 L 262 415 A 22 22 0 0 0 240 437 L 240 525 A 22 22 0 0 0 262 547 L 308 547 A 22 22 0 0 0 330 525 L 330 495 A 22 22 0 0 0 308 473 L 240 473"
                  fill="none" stroke="#FFFFFF" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 372 415 L 452 415 L 402 547"
                  fill="none" stroke="#FFD166" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {chest === 'spider_icon' && (
          <>
            <rect x="316.5" y="415" width="56" height="84" rx="28" fill="#1D3557" />
            <path d="M 275 425 L 414 485 M 275 485 L 414 425" fill="none" stroke="#1D3557" strokeWidth="22" strokeLinecap="round" />
          </>
        )}

        {/* Повязки внутри маски головы */}
        {head === 'headband67' && (
          <>
            <rect x="45" y="108" width="598" height="46" rx="23" fill="#FF3B5C" />
            <rect x="295" y="116" width="99" height="30" rx="15" fill="#FFFFFF" />
          </>
        )}
        {head === 'ninja_band' && (
          <>
            <rect x="45" y="104" width="598" height="56" rx="28" fill="#1E293B" />
            <rect x="235" y="114" width="219" height="36" rx="18" fill="#CBD5E1" />
            <circle cx="262" cy="132" r="7" fill="#475569" />
            <circle cx="427" cy="132" r="7" fill="#475569" />
          </>
        )}
      </g>

      {/* Глаза */}
      <g ref={gazeRef} className="avatar-face" aria-hidden="true">
      <g ref={eyelidsRef} className="avatar-eyelids">
      {eye === 'classic' && (
        <g>
          <rect x="235" y="172" width="65" height="156" rx="32.5" fill={eyeColor} />
          <rect x="389" y="172" width="65" height="156" rx="32.5" fill={eyeColor} />
        </g>
      )}
      {eye === 'darwin_eyes' && (
        <g>
          <path d="M 225 182 L 204 162 M 258 170 L 252 145" fill="none" stroke="#1C2230" strokeWidth="16" strokeLinecap="round" />
          <path d="M 464 182 L 485 162 M 431 170 L 437 145" fill="none" stroke="#1C2230" strokeWidth="16" strokeLinecap="round" />
          <rect x="222" y="170" width="84" height="142" rx="42" fill="#FFFFFF" />
          <rect x="383" y="170" width="84" height="142" rx="42" fill="#FFFFFF" />
          <rect x="246" y="196" width="44" height="90" rx="22" fill="#1C2230" />
          <rect x="399" y="196" width="44" height="90" rx="22" fill="#1C2230" />
          <circle cx="258" cy="216" r="11" fill="#FFFFFF" />
          <circle cx="411" cy="216" r="11" fill="#FFFFFF" />
        </g>
      )}
      {eye === 'goggles' && (
        <g>
          <rect x="212" y="156" width="96" height="172" rx="48" fill="#1C2230" />
          <rect x="228" y="172" width="64" height="140" rx="32" fill="#FFF59D" />
          <rect x="381" y="156" width="96" height="172" rx="48" fill="#1C2230" />
          <rect x="397" y="172" width="64" height="140" rx="32" fill="#FFF59D" />
        </g>
      )}
      {eye === 'spidey_eyes' && (
        <g>
          <rect x="206" y="160" width="102" height="164" rx="51" fill="#1D3557" />
          <rect x="226" y="180" width="62" height="124" rx="31" fill="#FFFFFF" />
          <rect x="381" y="160" width="102" height="164" rx="51" fill="#1D3557" />
          <rect x="401" y="180" width="62" height="124" rx="31" fill="#FFFFFF" />
        </g>
      )}

      </g>
      </g>
      {/* Внешние детали головы */}
      {head === 'hero_hair' && (
        <g>
          <rect x="205" y="48" width="279" height="60" rx="30" fill="#1C2230" />
          <rect x="265" y="20" width="160" height="58" rx="29" fill="#1C2230" />
          <rect x="335" y="6" width="68" height="52" rx="26" fill="#1C2230" />
        </g>
      )}
      {head === 'antenna' && (
        <g>
          <rect x="322.5" y="22" width="44" height="75" rx="22" fill={s.body} />
          <circle cx="344.5" cy="26" r="32" fill={s.accent} />
        </g>
      )}
      </g>
    </svg>
  );
}
