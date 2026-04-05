/**
 * ExportImportModal — copy all dashboard data as a portable string,
 * or paste one to restore. Safe: just base64-encoded JSON, no code.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const OVERLAY = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
const PANEL = {
  initial: { opacity: 0, y: 24, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 28 } },
  exit: { opacity: 0, y: 16, scale: 0.97 },
};

export default function ExportImportModal({ onClose, exportData, importData }) {
  const [mode, setMode] = useState('export');
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const exportString = exportData();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = exportString;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleImport = () => {
    setImportError(null);
    try {
      importData(importText.trim());
      setImportSuccess(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      setImportError(e.message);
    }
  };

  return (
    <motion.div {...OVERLAY}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div {...PANEL}
        className="glass-card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-white font-bold text-base">Export / Import</h2>
            <p className="text-charcoal-500 text-xs">Move your data between devices or browsers</p>
          </div>
          <button onClick={onClose} className="text-charcoal-500 hover:text-white transition-colors p-1.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tab switcher */}
          <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04]">
            {['export', 'import'].map((t) => (
              <button key={t} onClick={() => { setMode(t); setImportError(null); setImportSuccess(false); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                  mode === t ? 'bg-gold-500 text-charcoal-950 font-bold' : 'text-charcoal-400 hover:text-white'
                }`}>
                {t}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {mode === 'export' ? (
              <motion.div key="export" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <p className="text-charcoal-400 text-xs">
                  Copy this string and paste it into another browser to restore all your courses, grades, and settings.
                </p>

                <div className="relative">
                  <textarea
                    readOnly
                    value={exportString}
                    rows={4}
                    className="input-field w-full px-3 py-2.5 text-xs font-mono resize-none text-charcoal-400 select-all"
                    onClick={(e) => e.target.select()}
                  />
                  <p className="text-charcoal-600 text-[10px] mt-1">
                    {exportString.length.toLocaleString()} characters · Click to select all
                  </p>
                </div>

                <button onClick={handleCopy}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
                    copied
                      ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                      : 'gold-btn'
                  }`}>
                  {copied ? '✓ Copied to clipboard' : 'Copy to Clipboard'}
                </button>

                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <svg className="w-3.5 h-3.5 text-charcoal-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-charcoal-600 text-[11px] leading-relaxed">
                    This string contains only your course data — no passwords or personal info. It's safe to paste anywhere.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div key="import" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <p className="text-charcoal-400 text-xs">
                  Paste an export string below to restore data. This will replace your current dashboard.
                </p>

                <textarea
                  value={importText}
                  onChange={(e) => { setImportText(e.target.value); setImportError(null); }}
                  placeholder="Paste your bgpa_v1_... string here"
                  rows={4}
                  className="input-field w-full px-3 py-2.5 text-xs font-mono resize-none"
                  autoFocus
                />

                {importError && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="text-red-400 text-xs px-1">
                    {importError}
                  </motion.p>
                )}

                {importSuccess && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="text-green-400 text-xs px-1">
                    ✓ Data restored successfully
                  </motion.p>
                )}

                <button
                  onClick={handleImport}
                  disabled={!importText.trim() || importSuccess}
                  className="gold-btn w-full py-3 text-sm font-bold disabled:opacity-40"
                >
                  Restore Data
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
