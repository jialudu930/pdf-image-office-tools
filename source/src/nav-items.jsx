import { FileImage, HomeIcon, Image as ImageIcon, PanelsTopLeft } from "lucide-react";
import { lazy } from 'react';
const Index = lazy(() => import('./pages/Index.jsx'));
const ImageMerger = lazy(() => import('./pages/ImageMerger.jsx'));
const FormatConverter = lazy(() => import('./pages/FormatConverter.jsx'));
const PdfEditor = lazy(() => import('./pages/PdfEditor.jsx'));
const Compression = lazy(() => import('./components/CompressionApp.jsx'));

export const navItems = [
  {
    title: "合并与整理",
    to: "/",
    icon: <HomeIcon className="h-4 w-4" />,
    page: <Index />,
    category: "pdf",
  },
  {
    title: "PDF 文档工作台",
    to: "/pdf-editor",
    icon: <PanelsTopLeft className="h-4 w-4" />,
    page: <PdfEditor />,
    category: "pdf",
  },
  {
    title: "格式转换中心",
    to: "/format-converter",
    icon: <FileImage className="h-4 w-4" />,
    page: <FormatConverter />,
    category: "convert",
  },
  {
    title: "图片拼接",
    to: "/image-merger",
    icon: <ImageIcon className="h-4 w-4" />,
    page: <ImageMerger />,
    category: "image",
  },
  { title: 'PDF 压缩', to: '/pdf-compress', icon: <FileImage className="h-4 w-4" />, page: <Compression kind="pdf" />, category: 'pdf' },
  { title: '图片压缩', to: '/image-compress', icon: <ImageIcon className="h-4 w-4" />, page: <Compression kind="image" />, category: 'image' },
];
