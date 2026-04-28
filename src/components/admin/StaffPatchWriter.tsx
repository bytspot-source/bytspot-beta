/**
 * Staff NFC-write helper (B7) — admin-gated tool for provisioning blank
 * NTAG stickers in the field. Encodes the canonical Bytspot universal-link
 * (https://bytspot.app/p/<patchId>) as a URI NDEF record so a customer tap
 * routes through the same App Clip / universal-link path as a production tag.
 *
 * Native iOS path uses @capgo/capacitor-nfc.write. Browser path falls back to
 * the Web NFC NDEFReader.write API (Chromium on Android only). The button is
 * disabled when neither path is available so unsupported devices fail soft.
 */
import { useCallback, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Capacitor } from '@capacitor/core';
import { CapacitorNfc } from '@capgo/capacitor-nfc';
import { Radio, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

type WriteStatus = 'idle' | 'armed' | 'writing' | 'success' | 'error';

const PATCH_BASE_URL = 'https://bytspot.app/p/';

function buildPatchUrl(patchId: string): string {
  return `${PATCH_BASE_URL}${encodeURIComponent(patchId.trim())}`;
}

export function StaffPatchWriter() {
  const [patchId, setPatchId] = useState('');
  const [status, setStatus] = useState<WriteStatus>('idle');
  const [message, setMessage] = useState<string>('');

  const isNative = useMemo(
    () => typeof window !== 'undefined' && Capacitor.isNativePlatform(),
    [],
  );
  const supportsBrowserNfc = useMemo(
    () => typeof window !== 'undefined' && 'NDEFReader' in window,
    [],
  );
  const canWrite = isNative || supportsBrowserNfc;

  const writeBrowser = useCallback(async (url: string) => {
    const Reader = (window as unknown as { NDEFReader: new () => {
      write: (msg: { records: Array<{ recordType: string; data: string }> }) => Promise<void>;
    } }).NDEFReader;
    const writer = new Reader();
    await writer.write({ records: [{ recordType: 'url', data: url }] });
  }, []);

  const writeNative = useCallback(async (url: string) => {
    // Native flow: arm a scan, then write to the first discovered tag.
    await CapacitorNfc.startScanning({
      alertMessage: 'Hold the blank Bytspot patch sticker to your phone.',
      invalidateAfterFirstRead: false,
      iosSessionType: 'tag',
    });
    try {
      await CapacitorNfc.write({
        records: [{
          tnf: 1, // TNF_WELL_KNOWN
          type: [0x55], // 'U' — URI record
          id: [],
          payload: encodeUriPayload(url),
        }],
      });
    } finally {
      await CapacitorNfc.stopScanning().catch(() => undefined);
    }
  }, []);

  const handleWrite = useCallback(async () => {
    const trimmed = patchId.trim();
    if (!trimmed) {
      setStatus('error');
      setMessage('Enter a patch ID to encode.');
      return;
    }
    if (!canWrite) {
      setStatus('error');
      setMessage('This device cannot write NFC tags. Use the iOS app or a Chromium browser on Android.');
      return;
    }

    setStatus('armed');
    setMessage(isNative ? 'Hold a blank patch to your phone…' : 'Tap a blank patch to your device when prompted by the browser.');
    const url = buildPatchUrl(trimmed);
    try {
      setStatus('writing');
      if (isNative) await writeNative(url);
      else await writeBrowser(url);
      setStatus('success');
      setMessage(`Wrote ${url}`);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to write the tag. Move the patch closer and try again.');
    }
  }, [patchId, canWrite, isNative, writeBrowser, writeNative]);

  const busy = status === 'armed' || status === 'writing';

  return (
    <div className="rounded-[16px] bg-[#1C1C1E] border border-white/10 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-white/40 font-bold">PROVISION NFC PATCH</p>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${canWrite ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300' : 'bg-white/5 border-white/10 text-white/40'}`}>
          {canWrite ? 'NFC ready' : 'NFC unavailable'}
        </span>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          placeholder="Patch ID (e.g. patch_xyz123)"
          value={patchId}
          onChange={(e) => setPatchId(e.target.value)}
          disabled={busy}
          className="flex-1 px-3 py-2 rounded-[10px] bg-black/40 border border-white/20 text-white text-[14px] outline-none placeholder:text-white/25 disabled:opacity-50 font-mono"
        />
        <motion.button
          onClick={handleWrite}
          disabled={busy || !canWrite}
          whileTap={{ scale: 0.97 }}
          className="px-4 py-2.5 rounded-[12px] bg-cyan-500/80 text-white font-semibold text-[14px] flex items-center justify-center gap-2 active:bg-cyan-500 disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" strokeWidth={2.5} />}
          {busy ? 'Writing…' : 'Write tag'}
        </motion.button>
      </div>
      {message && (
        <div className={`flex items-start gap-2 text-[12px] leading-snug ${
          status === 'success' ? 'text-emerald-300' : status === 'error' ? 'text-red-300' : 'text-white/55'
        }`}>
          {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 mt-[2px] shrink-0" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 mt-[2px] shrink-0" />}
          <span className="font-mono break-all">{message}</span>
        </div>
      )}
      <p className="text-[10px] text-white/25 mt-3 leading-snug">
        Encodes <span className="font-mono">{PATCH_BASE_URL}&lt;id&gt;</span> as a URI record. Customer taps will resolve through the App Clip / universal-link path.
      </p>
    </div>
  );
}

/** RFC 3066 URI NDEF payload: 1 byte URI prefix code + UTF-8 URI bytes. */
function encodeUriPayload(url: string): number[] {
  const prefixes: Array<[string, number]> = [
    ['https://www.', 0x02], ['http://www.', 0x01], ['https://', 0x04], ['http://', 0x03],
  ];
  for (const [prefix, code] of prefixes) {
    if (url.startsWith(prefix)) {
      const tail = url.slice(prefix.length);
      return [code, ...Array.from(new TextEncoder().encode(tail))];
    }
  }
  return [0x00, ...Array.from(new TextEncoder().encode(url))];
}
