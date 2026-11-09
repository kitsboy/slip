/**
 * The bottom of the page: the proof, the build, and who made it.
 *
 * A footer is where a till tells the truth about itself one last time, so it is not a pile of
 * small grey links. Three blocks, in the order a doubtful shopkeeper would ask:
 *
 *  - **Nothing phones home** — the live count of requests to other servers, counted by the
 *    reader's own browser. It is the strongest claim slip makes, and it was previously an 11px
 *    sentence at the very bottom. Here it is the headline, and the number is drawn large.
 *  - **This build** — the version, today's book seal, and whether this copy is online and current.
 *    A merchant who is reading a stale shell needs to see that here, not in a menu.
 *  - **Made by** — who to thank, that it is free and MIT, and how to put it on the home screen.
 *
 * The words stay exactly as honest as the rest of the page: the zero is measured, not asserted,
 * and it changes the moment the count is not zero.
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
        <section className="v2-foot-block v2-foot-proof" aria-label="Nothing phones home">
          <p className="v2-foot-kicker">Nothing phones home</p>
          <RequestCounter hero />
          <p className="v2-foot-note">
            Your own browser counted that number, not us. No analytics, no fonts from anywhere else,
            no CDN, no cookies, no account.
          </p>
        </section>

        <section className="v2-foot-block" aria-label="This build">
          <p className="v2-foot-kicker">This build</p>
          <p className="v2-foot-build">
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
        </section>

        <section className="v2-foot-block v2-foot-sign" aria-label="Who made it">
          <p className="v2-foot-kicker">Made by</p>
          {signature && (
            <a
              className="v2-foot-brand"
              href="https://giveabit.io"
              target="_blank"
              rel="noreferrer noopener"
              data-brand="giveabit"
            >
              {signature}
            </a>
          )}
          <p className="v2-foot-note">
            Free and open source under MIT. It is one file: save the page and it still opens with
            the network off.
          </p>
          <Install />
        </section>
      </div>

      <div className="v2-foot-base">
        <span className="v2-foot-word" aria-hidden>
          slip
        </span>
        <p className="v2-foot-promise">
          no accounts · no analytics · no telemetry · MIT licensed
        </p>
      </div>
    </footer>
  );
}
