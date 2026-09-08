import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export default function PdfPageSettings({ onExport, disabled, isProcessing }) {
  const [name, setName] = useState('已删页.pdf');
  return (
    <Card className="export-panel">
      <div>
        <h3 className="font-medium">导出处理结果</h3>
        <p className="text-xs text-muted-foreground mt-1">系统只会移除已标记的页面</p>
      </div>
      <div className="flex gap-3">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="输出文件名" />
        <Button onClick={() => onExport(name)} disabled={disabled || isProcessing} className="shrink-0">
          {isProcessing ? '处理中...' : '生成新 PDF'}
        </Button>
      </div>
    </Card>
  );
}
