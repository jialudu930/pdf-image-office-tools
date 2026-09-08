import { Component } from 'react';

export default class PageBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('工具页面加载失败', error); }
  render() {
    if (this.state.error) return <section className="tool-page" role="alert">
      <h1>这个工具暂时未能打开</h1>
      <p className="my-4">请检查网络后重新加载；也可以从顶部切换其他工具。</p>
      <button className="recovery-button" onClick={() => window.location.reload()}>重新加载</button>
    </section>;
    return this.props.children;
  }
}
