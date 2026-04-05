// Constantes de planos — sem imports de servidor, seguro para client components

export interface PlanDef {
  name: string;
  price: number;
  accountsLimit: number;
  trialDays?: number;
  /** null = todas as plataformas liberadas */
  maxPlatforms: number | null;
}

export const PLANS: Record<string, PlanDef> = {
  trial: {
    name: "Trial",
    price: 0,
    accountsLimit: 30,   // acesso premium durante o trial
    trialDays: 7,
    maxPlatforms: null,  // todas as plataformas liberadas
  },
  start: {
    name: "Start",
    price: 49.9,
    accountsLimit: 3,
    maxPlatforms: 1,     // apenas 1 plataforma (meta, google ou ga4)
  },
  plus: {
    name: "Plus",
    price: 129.9,
    accountsLimit: 10,
    maxPlatforms: null,
  },
  premium: {
    name: "Premium",
    price: 299.9,
    accountsLimit: 30,
    maxPlatforms: null,
  },
};

export type PlanKey = "trial" | "start" | "plus" | "premium";
