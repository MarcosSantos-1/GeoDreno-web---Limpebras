/** Coleções Firestore GeoDreno — alinhado ao plano de inventário BL */
/** Mantido em sync com `shared/firestore.ts` na raiz do monorepo (mobile). */

export type VisitaStatus = "em_execucao" | "finalizada" | "cancelada";

export type BueiroTipo = "boca_lobo" | "boca_leao";

export interface UsuarioDoc {
  nome: string;
  createdAt: string;
}

export interface VisitaDoc {
  userId: string;
  setor: string;
  status: VisitaStatus;
  startedAt: string;
  endedAt?: string;
}

export interface BueiroRegistroDoc {
  visitaId: string;
  setor: string;
  userId: string;
  tipo: BueiroTipo;
  quantidade: number;
  lat: number;
  lng: number;
  numeracaoRelativa?: string;
  enderecoManual?: string;
  gpsAccuracyM?: number | null;
  gpsAlerta?: boolean;
  createdAt: string;
  /** UUID v4 gerado no cliente para idempotência ao reenviar fila offline */
  clientId?: string;
  /** Nome de logradouro do catálogo do setor (referência). */
  logradouro?: string;
  /** Endereço obtido por geocodificação reversa das coordenadas do ponto (app/web). */
  enderecoGeocodificado?: string;
  subprefeitura?: string;
  displayName?: string;
}

export interface SetorProgressoDoc {
  ultimoStatus: "pendente" | "em_execucao" | "finalizado";
  ultimaVisitaId?: string;
  ultimoUserId?: string;
  updatedAt: string;
}

export interface SectorsFile {
  generatedAt: string;
  source: string;
  sectors: SectorCompact[];
}

export interface SectorCompact {
  setor: string;
  subRegional: string;
  centroidLat: number;
  centroidLng: number;
  logradouro: string;
  subprefeitura: string;
  /** Índice na ordenação global (0..n-1) para fluxo “Continuar” */
  orderIndex: number;
}
