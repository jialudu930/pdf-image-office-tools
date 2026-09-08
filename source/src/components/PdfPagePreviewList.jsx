import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RotateCcw, Trash2, Eye } from 'lucide-react';

export default function PdfPagePreviewList({ pages, deletedPages, onTogglePage, onReset }) {
  if (!pages.length) return null;
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">页面预览与管理</h3>
          <p className="text-xs text-muted-foreground mt-1">
            共 {pages.length} 页，已标记删除 {deletedPages.size} 页
          </p>
        </div>
        {deletedPages.size > 0 && (
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            重置选择
          </Button>
        )}
      </div>

      <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2">
        {pages.map(({ pageNum, url }) => {
          const isDeleted = deletedPages.has(pageNum);
          return (
            <div
              key={pageNum}
              onClick={() => onTogglePage(pageNum)}
              className={`group relative rounded-xl border-2 transition-all cursor-pointer overflow-hidden ${
                isDeleted
                  ? 'border-destructive bg-destructive/5'
                  : 'border-border hover:border-primary hover:shadow-sm'
              }`}
            >
              <div className="flex flex-col sm:flex-row">
                <div className="relative w-full sm:w-40 shrink-0 aspect-[210/297] bg-muted/30 border-b sm:border-b-0 sm:border-r border-border">
                  <embed
                    src={`${url}#toolbar=0&navpanes=0&scrollbar=0`}
                    type="application/pdf"
                    className="w-full h-full pointer-events-none"
                  />
                  {isDeleted && (
                    <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center pointer-events-none">
                      <div className="bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 shadow-sm">
                        <Trash2 className="h-3 w-3" />
                        待删除
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold ${
                        isDeleted ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {pageNum}
                    </div>
                    <div>
                      <p className="text-sm font-medium">第 {pageNum} 页</p>
                      <p className="text-xs text-muted-foreground">
                        {isDeleted ? '已标记删除，再次点击取消' : '点击选中删除'}
                      </p>
                    </div>
                  </div>
                  {!isDeleted && (
                    <Eye className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        提示：点击任意页面卡片即可标记为删除，再次点击可取消标记
      </p>
    </Card>
  );
}
