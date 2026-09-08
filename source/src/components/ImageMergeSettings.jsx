import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ImageMergeSettings({ count, onMerge, isProcessing }) {
  const [name, setName] = useState('合并图片.png');
  const [format, setFormat] = useState('image/png');
  return <div className="panorama-output-settings">
    <Input aria-label="输出文件名" disabled={isProcessing} value={name} onChange={(event) => setName(event.target.value)} />
    <Select disabled={isProcessing} value={format} onValueChange={setFormat}>
      <SelectTrigger aria-label="输出格式"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="image/png">PNG</SelectItem><SelectItem value="image/jpeg">JPG</SelectItem></SelectContent>
    </Select>
    <Button onClick={() => onMerge(name, format)} disabled={count < 2 || isProcessing}><Download />{isProcessing ? '处理中' : '导出长图'}</Button>
  </div>;
}
