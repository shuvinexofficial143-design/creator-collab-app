import type {Metadata} from 'next';
import {brand} from '@/lib/config';
import './globals.css';
export const metadata:Metadata={title:{default:brand,template:`%s · ${brand}`},description:'A dedicated workspace for product videos and voice over collaborations.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
