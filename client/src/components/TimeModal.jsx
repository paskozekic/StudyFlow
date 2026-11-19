import { useState } from 'react';
import { AvailabilityForm } from './AvailabilityForm.jsx';
import { UnavailabilityForm } from './UnavailabilityForm.jsx';
import Modal from './Modal.jsx';

const MODES = {
  availability: { label: '✓ Slobodan sam', title: 'Kada možeš učiti?' },
  unavailability: { label: '⊘ Zauzet sam', title: 'Zauzeto – ne mogu učiti' },
};

/**
 * Dostupnost i zauzeto vrijeme u istom prozoru: preklopnik na vrhu bira između tjednih
 * termina za učenje i zauzetih blokova. Oba obrasca ostaju učitana, pa se upisano ne gubi.
 */
export default function TimeModal({ mode: initialMode = 'availability', block, ...props }) {
  const [mode, setMode] = useState(block ? 'unavailability' : initialMode);
  const title = block ? 'Uredi zauzeto vrijeme' : MODES[mode].title;

  return (
    <Modal title={title} onClose={props.onClose} size="wide">
      {!block && (
        <div className="segmented" role="tablist" aria-label="Vrsta vremena">
          {Object.entries(MODES).map(([value, { label }]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={mode === value ? `on on-${value}` : ''}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!block && (
        <div hidden={mode !== 'availability'}>
          <AvailabilityForm {...props} />
        </div>
      )}
      <div hidden={mode !== 'unavailability'}>
        <UnavailabilityForm block={block} {...props} />
      </div>
    </Modal>
  );
}
