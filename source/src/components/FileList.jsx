import { FileText, FileType2, ArrowUp, ArrowDown, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function FileList({ files, onMove, onRemove, onClearAll }) {
  if (!files.length) return null;
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium">待合并文件（共 {files.length} 个）</h2>
        <Button variant="outline" size="sm" onClick={onClearAll} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-4 w-4 mr-1" />
          一键清除
        </Button>
      </div>
      <div className="space-y-2">
        {files.map((f, i) => (
          <div key={f.id} className="flex items-center justify-between p-3 bg-background border rounded-lg">
            <div className="flex items-center gap-3">
              {f.type === 'pdf' ? <FileText className="h-5 w-5 text-red-500" /> : <FileType2 className="h-5 w-5 text-blue-500" />}
              <div>
                <p className="text-sm font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.pageCount} 页</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button aria-label={`前移 ${f.name}`} variant="ghost" size="icon" disabled={i === 0} onClick={() => onMove(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button aria-label={`后移 ${f.name}`} variant="ghost" size="icon" disabled={i === files.length - 1} onClick={() => onMove(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button aria-label={`移除 ${f.name}`} variant="ghost" size="icon" onClick={() => onRemove(i)}><X className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
