let activeWorker = null;
let generation = 0;

function collectWords(blocks = []) {
  const words = [];
  blocks.forEach((block) => {
    block.paragraphs?.forEach((paragraph) => {
      paragraph.lines?.forEach((line) => {
        line.words?.forEach((word) => words.push(word));
      });
    });
  });
  return words;
}

export async function recognizeCanvas(canvas, onProgress) {
  await cancelOcr();
  const id = generation;
  const { createWorker, OEM } = await import('tesseract.js');
  const worker = await createWorker(['chi_sim', 'eng'], OEM.LSTM_ONLY, {
    logger: (message) => {
      if (id === generation && message.status === 'recognizing text') onProgress?.(Math.round(message.progress * 100));
    },
  });
  if (id !== generation) { await worker.terminate(); throw new DOMException('已取消识别', 'AbortError'); }
  activeWorker = worker;
  try {
    const result = await worker.recognize(canvas, {}, { blocks: true, text: true });
    if (id !== generation) throw new DOMException('已取消识别', 'AbortError');
    const words = collectWords(result.data.blocks);
    return {
      text: result.data.text || '',
      words: words.map((word) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: word.bbox,
      })),
    };
  } catch (error) {
    if (id !== generation) throw new DOMException('已取消识别', 'AbortError');
    throw error;
  } finally {
    if (activeWorker === worker) { activeWorker = null; await worker.terminate(); }
  }
}

export async function cancelOcr() {
  generation++;
  const worker = activeWorker;
  activeWorker = null;
  if (worker) await worker.terminate();
}
