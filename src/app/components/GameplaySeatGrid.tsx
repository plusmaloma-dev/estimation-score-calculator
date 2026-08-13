import type { OnlineGameplayTableSeat } from '../../online/gameplay/types.js';

export function GameplaySeatGrid({
  tableName,
  seats,
}: {
  readonly tableName: string;
  readonly seats: readonly OnlineGameplayTableSeat[];
}) {
  return (
    <ol className="gameplay-seat-grid" aria-label={`${tableName} seats`}>
      {[0, 1, 2, 3].map((seatIndex) => {
        const seat = seats.find((candidate) => candidate.seat === seatIndex);
        return (
          <li className={seat === undefined ? 'gameplay-seat gameplay-seat--vacant' : 'gameplay-seat'} key={seatIndex}>
            <strong>Seat {seatIndex + 1}: {seat?.displayName ?? 'Vacant'}</strong>
            {seat !== undefined && (
              <span>{seat.kind === 'bot' ? 'Permanent Standard bot' : 'Human player'}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
