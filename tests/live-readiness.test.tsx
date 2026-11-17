import {it,expect,vi} from 'vitest';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import LiveTest from '../src/ui/LiveTest';
vi.mock('../src/core/addresses',()=>({checkAddress:()=>({ok:true})}));
const {fetchActivity}=vi.hoisted(()=>({fetchActivity:vi.fn()}));
vi.mock('../src/core/providers/esplora',()=>({targetFor:()=>({}),fetchAddressActivity:fetchActivity}));
it('historical funds cannot pass; a fresh confirmed increase and new transaction are required',async()=>{
 vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);let received=100000n,count=5;
 fetchActivity.mockImplementation(async()=>({chainReceivedAtoms:received,mempoolReceivedAtoms:0n,txCount:count}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<LiveTest/>));const input=host.querySelector('input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'tb1fixture');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('request testnet'))!.click();});
 expect(host.textContent).toContain('Baseline captured');
 await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(host.textContent).not.toContain('Fresh increase mined');
 received=110000n;await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(host.textContent).not.toContain('Fresh increase mined');
 count=6;await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(host.textContent).toContain('Fresh increase mined');
 }finally{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();}
});
