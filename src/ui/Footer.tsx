/**
 * The bottom of the page.
 *
 * Two columns inside the same 1152px column the rest of the page sits in, then one closing line.
 * The first version of this footer ran the full width of a wide screen while the till above it was
 * centred, which made it look like it belonged to a different site — so every measurement here
 * comes from the page's own container rather than from the viewport.
 *
 *  - **Nothing phones home** — the live count of requests to other servers, counted by the reader's
 *    own browser. It is the strongest claim slip makes, and it used to be an 11px grey sentence at
 *    the very bottom of the page.
 *  - **This build** — the version, today's book seal, whether this copy is online, the clip that
 *    explains the strip, and the way onto the home screen.
 *  - **The closing line** — the word, the credit, and the promise.
 *
 * The words stay as honest as the rest of the page: the zero is measured, not asserted, and it
 * changes the moment the count is not zero.
 */

import BookSeal from './BookSeal';
import InfoVideo from './InfoVideo';
import Install from './Install';
import RequestCounter from './RequestCounter';
import Status from './Status';
import { buildLabel } from '../core/buildinfo';
import { loadSettings } from '../core/settings';
import { store as appStore } from '../core/storage';

export default function Footer() {
  const signature = loadSettings(appStore()).settings.signature.trim();

  return (
    <footer className="v2-foot" role="contentinfo">
      <div className="v2-foot-wrap">
        <section className="v2-foot-proof" aria-label="Nothing phones home">
          <p className="v2-foot-kicker">Nothing phones home</p>
          <RequestCounter hero />
          <p className="v2-foot-note">
            slip ships no analytics, no fonts from anywhere else, no CDN, no cookies and no account.
            That count is your own browser&apos;s log, not our word for it.
          </p>
        </section>

        <section className="v2-foot-build" aria-label="This build">
          <p className="v2-foot-kicker">This build</p>
          <p className="v2-foot-stamp">
            <span className="v2-foot-ver">{buildLabel()}</span>
            <BookSeal />
          </p>
          <Status />
          <div className="v2-foot-film">
            <InfoVideo
              src="videos/03-status-strip.mp4"
              poster="videos/03-status-strip.jpg"
              title="Status, rails, networks, backend"
              seconds={17}
              label="What the strip means"
            />
          </div>
          <Install />
        </section>
      </div>

      <div className="v2-foot-base">
        <span className="v2-foot-word" aria-hidden>
          slip
        </span>
        <p className="v2-foot-promise">
          Free and open source under MIT
          {signature && (
            <>
              {' · made by '}
              <a
                className="v2-foot-brand"
                href="https://giveabit.io"
                target="_blank"
                rel="noreferrer noopener"
                data-brand="giveabit"
              >
                {signature}
              </a>
            </>
          )}
          {' · no accounts · no analytics · no telemetry'}
        </p>
        <p className="v2-foot-promise">
          <a className="v2-foot-link" href="#limits">
            What slip cannot do
          </a>
          {' · the limits, stated before you need them'}
        </p>
      </div>
    </footer>
  );
}
