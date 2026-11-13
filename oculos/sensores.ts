interface EventoOrientacao {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** iPhone pede licença para ler o giro do celular; precisa ser chamada direto no toque. */
export function pedirSensores(): Promise<boolean> {
  const E = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as unknown as EventoOrientacao | undefined;
  if (!E?.requestPermission) return Promise.resolve(true);
  try {
    return E.requestPermission().then(
      (r) => r === 'granted',
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}
