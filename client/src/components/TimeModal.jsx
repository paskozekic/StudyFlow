import { useState } from 'react';
import { WeeklyWindowsForm } from './WeeklyWindowsForm.jsx';
import { UnavailabilityForm } from './UnavailabilityForm.jsx';
import Modal from './Modal.jsx';

const MODES = {
  free: { label: '✓ Slobodan sam', title: 'Kada možeš učiti?' },
  busy: { label: '⊘ Zauzet sam', title: 'Kada si zauzet?' },
};

/**
 * Tjedno slobodno i zauzeto vrijeme u istom prozoru: preklopnik bira između dva jednaka
 * obrasca (dani u tjednu + brzo postavljanje). Oba ostaju učitana, pa se upisano ne gubi.
 *
 * Zauzeto vezano uz točan datum (klik u kalendar, uređivanje postojećeg bloka) otvara se
 * kao jednokratni unos, bez preklopnika.
 */
export default function TimeModal({ mode = 'free', block, date, time, ...props }) {
  const [current, setCurrent] = useState(mode);

  if (block || date) {
    return (
      <Modal title={block ? 'Uredi zauzeto vrijeme' : 'Zauzeto – jednokratno'} onClose={props.onClose} size="wide">
        <UnavailabilityForm block={block} date={date} time={time} {...props} />
      </Modal>
    );
  }

  return (
    <Modal title={MODES[current].title} onClose={props.onClose} size="wide">
      <div className="segmented" role="tablist" aria-label="Vrsta vremena">
        {Object.entries(MODES).map(([value, { label }]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={current === value}
            className={current === value ? `on on-${value}` : ''}
            onClick={() => setCurrent(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {Object.keys(MODES).map((kind) => (
        <div key={kind} hidden={current !== kind}>
          <WeeklyWindowsForm kind={kind} {...props} />
        </div>
      ))}
    </Modal>
  );
}
