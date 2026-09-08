import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { Suspense } from 'react';
import PageBoundary from './components/PageBoundary';
import { Files } from "lucide-react";
import { navItems } from "./nav-items";
import { cn } from "@/lib/utils";

const queryClient = new QueryClient();
const categories = [
  { id: "pdf", title: "PDF 编辑", to: "/" },
  { id: "image", title: "图片编辑", to: "/image-merger" },
  { id: "convert", title: "格式转换", to: "/format-converter" },
];

function Navigation() {
  const location = useLocation();
  const activeItem = navItems.find((item) => item.to === location.pathname) || navItems.find((item) => item.to === '/');
  const activeCategory = activeItem.category;
  const subItems = navItems.filter((item) => item.category === activeCategory);

  return (
    <nav className="app-nav">
      <div className="nav-inner">
        <Link to="/" className="brand" aria-label="文档工坊首页">
          <span className="brand-mark"><Files /></span>
          <span><strong>文档工坊</strong><small>本地文件处理</small></span>
        </Link>
        <div className="primary-nav" aria-label="文件类别">
          {categories.map((category) => (
            <Link
              key={category.id}
              to={category.to}
              className={cn("primary-nav-link", activeCategory === category.id && "active")}
            >
              {category.title}
            </Link>
          ))}
        </div>
      </div>
      <div className="sub-nav-wrap">
        <div className="sub-nav">
          {subItems.map(({ to, title, icon }) => (
            <Link key={to} to={to} className={cn("sub-nav-link", location.pathname === to && "active")}>
              {icon}{title}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

function ToolRoutes() {
  const location = useLocation();
  return <PageBoundary key={location.pathname}><Suspense fallback={<div className="workspace-loading" role="status"><div className="loading-bar" /><p>正在加载工具…</p></div>}>
    <Routes>
      {navItems.map(({ to, page }) => <Route key={to} path={to} element={page} />)}
      <Route path="/image-to-pdf" element={<Navigate to="/format-converter" replace />} />
      <Route path="/pdf-page-deleter" element={<Navigate to="/" replace />} />
      <Route path="/pdf-organizer" element={<Navigate to="/" replace />} />
      <Route path="/pdf-merger" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense></PageBoundary>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <HashRouter>
        <Navigation />
        <ToolRoutes />
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
