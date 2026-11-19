import { useEffect, useRef } from 'react';

export default function Modal({ title, onClose, children, size }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={size ? `modal modal-${size}` : 'modal'}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // klik na pozadinu zatvara prozor
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Zatvori">
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
