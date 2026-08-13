import type { OnlineActiveSeatControl } from '../../online/gameplay/activeControlTypes.js';

function controlLabel(seat: OnlineActiveSeatControl): string {
  if (seat.controlOwner === 'permanent-bot') return 'Permanent Standard bot';
  if (seat.controlOwner === 'temporary-bot') {
    return seat.reclaimPending
      ? 'Temporary bot · reclaim pending'
      : 'Temporary bot control';
  }
  return seat.connection === 'connected' ? 'Human connected' : 'Human disconnected';
}

function identityLabel(seat: OnlineActiveSeatControl): string {
  if (seat.seatKind === 'bot') return seat.botId ?? `Standard bot ${seat.seat + 1}`;
  return seat.humanUserId ?? `Human player ${seat.seat + 1}`;
}

export function ActiveSeatStatus({
  seats,
  activeSeat,
}: {
  readonly seats: readonly OnlineActiveSeatControl[];
  readonly activeSeat?: 0 | 1 | 2 | 3;
}) {
  return (
    <ol className="active-seat-grid" aria-label="Active seat control">
      {[0, 1, 2, 3].map((seatIndex) => {
        const seat = seats.find((candidate) => candidate.seat === seatIndex);
        return (
          <li
            className={activeSeat === seatIndex ? 'active-seat-card active-seat-card--turn' : 'active-seat-card'}
            key={seatIndex}
          >
            <strong>Seat {seatIndex + 1}</strong>
            {seat === undefined ? (
              <span>Control state unavailable</span>
            ) : (
              <>
                <span>{identityLabel(seat)}</span>
                <span>{controlLabel(seat)}</span>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
