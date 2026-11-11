/** Símbolo e nome Meu Marceneiro. O símbolo é o mesmo arquivo do favicon. */
export function Marca({ tamanho = 'normal' }: { tamanho?: 'normal' | 'grande' }) {
  const grande = tamanho === 'grande';
  return (
    <span className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className={grande ? 'size-10' : 'size-8'} />
      <span className={`tracking-tight ${grande ? 'text-xl' : 'text-[1.05rem]'}`}>
        <span className="font-medium text-freijo-escuro">Meu</span> <span className="font-bold text-nogueira">Marceneiro</span>
      </span>
    </span>
  );
}
