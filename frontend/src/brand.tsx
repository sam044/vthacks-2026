import { Heart } from 'lucide-react';

export function Brand({ large = false }: { large?: boolean }) {
  return <span className={'care-brand ' + (large ? 'care-brand-large' : '')}>
    <span className="care-mark"><Heart strokeWidth={1.6}/></span>
    <span>hokie<span className="brand-light">care</span></span>
  </span>;
}
