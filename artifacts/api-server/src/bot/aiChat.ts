/**
 * VBRI AI — Giriş Noktası
 * Eski Gemini bağımlılığı kaldırıldı. Tamamen yerel VBRI AI motoru kullanılıyor.
 */

export { handleVbriAI as handleAiMessage, clearChannelHistory, getHistorySize } from "./vbriAI/engine";
