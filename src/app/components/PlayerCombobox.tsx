import { useEffect, useId, useState } from 'react';
import type { DirectoryPlayer, PlayerDirectoryPort } from '../../online/players/types.js';

export function PlayerCombobox({
  label,
  directory,
  selected,
  excludedPlayerIds,
  onChange,
}: {
  readonly label: string;
  readonly directory: PlayerDirectoryPort;
  readonly selected?: DirectoryPlayer;
  readonly excludedPlayerIds: readonly string[];
  readonly onChange: (player: DirectoryPlayer | undefined) => void;
}) {
  const inputId = useId();
  const listboxId = useId();
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<readonly DirectoryPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  const exactMatch = options.some(
    (player) => player.name.localeCompare(normalizedQuery, undefined, { sensitivity: 'accent' }) === 0,
  );
  const canCreate = normalizedQuery.length > 0 && !exactMatch && !loading;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void directory.listActivePlayers(query).then((players) => {
      if (cancelled) return;
      setOptions(players.filter((player) => !excludedPlayerIds.includes(player.id)));
      setLoading(false);
    }).catch((reason: unknown) => {
      if (cancelled) return;
      setOptions([]);
      setLoading(false);
      setError(reason instanceof Error ? reason.message : 'Players could not be loaded.');
    });
    return () => {
      cancelled = true;
    };
  }, [directory, excludedPlayerIds, query]);

  function choose(player: DirectoryPlayer) {
    setQuery(player.name);
    setError(undefined);
    setOpen(false);
    onChange(player);
  }

  async function create() {
    const result = await directory.createPlayer(normalizedQuery);
    if (!result.valid || result.value === undefined) {
      setError(result.errors.join('; '));
      setOpen(true);
      return;
    }
    choose(result.value);
  }

  return (
    <div className="player-combobox">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setError(undefined);
          setOpen(true);
          if (selected !== undefined) onChange(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' && options[0] !== undefined) {
            event.preventDefault();
            choose(options[0]);
          } else if (event.key === 'Enter' && canCreate) {
            event.preventDefault();
            void create();
          }
        }}
      />
      {open && (
        <div id={listboxId} role="listbox" aria-label={`${label} options`} className="player-combobox-options">
          {loading && <p className="empty-player-options">Loading players…</p>}
          {!loading && options.map((player) => (
            <button
              key={player.id}
              type="button"
              role="option"
              aria-selected={selected?.id === player.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(player)}
            >
              {player.name}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              role="option"
              aria-selected="false"
              className="create-player-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void create()}
            >
              Create player “{normalizedQuery}”
            </button>
          )}
          {!loading && options.length === 0 && !canCreate && <p className="empty-player-options">No active players found.</p>}
        </div>
      )}
      {error !== undefined && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}
