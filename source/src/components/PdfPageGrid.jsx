import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FileText, RotateCcw } from 'lucide-react';

export default function PdfPageGrid({ pageCount, deletedPages, onTogglePage, onReset }) {
  if (!pageCount) return null;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">页面管理</h3>
          <p className="text-xs text-muted-foreground mt-1">共 {pageCount} 页，已标记删除 {deletedPages.size} 页</p>
        </div>
        {deletedPages.size > 0 && (
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-4 w-4 mr-1" />重置选择
          </Button>
        )}
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
        {pages.map(pageNum => {
          const isDeleted = deletedPages.has(pageNum);
          return (
            <button key={pageNum} onClick={() => onTogglePage(pageNum)}
              className={`relative flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${isDeleted ? 'border-destructive bg-destructive/10 text-destructive opacity-60' : 'border-border bg-background hover:border-primary hover:bg-muted/50'}`}>
              <FileText className={`h-5 w-5 mb-1 ${isDeleted ? 'text-destructive' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium">{pageNum}</span>
              {isDeleted && <span className="absolute -top-1 -right-1 h-3 w-3 bg-destructive rounded-full" />}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">点击页面即可标记为删除，再次点击可取消</p>
    </Card>
  );
}
