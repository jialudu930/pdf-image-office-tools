import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export default function MergeSettings({ count, onMerge, isProcessing, outputPages = 0, previewReady = true }) {
  const [name, setName] = useState('合并文档.pdf');
  const actionLabel = count === 1 ? '导出 PDF' : '合并并导出';

  return (
    <Card className="export-panel">
      <div>
        <h3 className="font-medium">{count === 1 ? '导出整理结果' : '导出合并结果'}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {outputPages ? `将生成 ${outputPages} 页 PDF` : '添加文件后即可生成'}
        </p>
      </div>
      <div className="flex gap-3">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="输出文件名" />
        <Button onClick={() => onMerge(name)} disabled={count < 1 || isProcessing || !previewReady} className="shrink-0">
          {isProcessing ? '正在处理…' : actionLabel}
        </Button>
      </div>
    </Card>
  );
}
