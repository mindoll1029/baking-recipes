// Original PNGs: body from 돼지 수정본.zip, hand from 잡고있는 양손.zip.
// Vite fingerprints the imports so each release serves the correct artwork.
import BODY from '../assets/piggy-revised/piggy-body.png'
import HAND from '../assets/piggy-revised/piggy-hands.png'

const BACKGROUND = '/entrance/piggy-background.webp'
const LETTERING = '/entrance/piggy-lettering.webp'
export const ENTRANCE_IMAGES = [BACKGROUND, LETTERING, BODY, HAND]

// The patterned strips are foreground walls. The red artwork is the space
// behind them. The body rotates around a fixed point at the right foot;
// its placement never slides. The palm stays on the front of the wall.
export default function PiggyScene() {
  return (
    <div className="piggy-scene" aria-hidden="true">
      <div className="piggy-opening">
        <svg className="piggy-red-space" viewBox="290 40 868 1006" preserveAspectRatio="none">
          <image href={BACKGROUND} width="1448" height="1086" />
        </svg>
        <div className="piggy-character">
          <svg className="piggy-rig" viewBox="0 0 1122 1402">
            <g className="piggy-body-placement" transform="translate(-755 0)">
              <g className="piggy-body">
                <image href={BODY} width="1122" height="1402" />
              </g>
            </g>
          </svg>
        </div>
      </div>
      <img className="piggy-lettering" src={LETTERING} alt="" width="1774" height="887" draggable={false} />
      <div className="piggy-wall piggy-wall-left">
        <svg viewBox="0 0 257 1086" preserveAspectRatio="xMaxYMid slice"><image href={BACKGROUND} width="1448" height="1086" /></svg>
      </div>
      <div className="piggy-wall piggy-wall-right">
        <svg viewBox="1191 0 257 1086" preserveAspectRatio="xMinYMid slice"><image href={BACKGROUND} width="1448" height="1086" /></svg>
      </div>
      <div className="piggy-grip-stage">
        <svg className="piggy-rig" viewBox="0 0 1122 1402">
          <g className="piggy-hand">
            <g transform="translate(-31 935) rotate(-90)">
              <svg x="-65" y="-40.625" width="130" height="81.25" viewBox="180 430 440 275"><image href={HAND} width="1536" height="1024" /></svg>
            </g>
          </g>
        </svg>
      </div>
    </div>
  )
}
