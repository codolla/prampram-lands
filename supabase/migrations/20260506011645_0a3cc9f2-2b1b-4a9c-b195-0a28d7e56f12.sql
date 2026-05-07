ALTER TABLE public.app_settings
  ADD COLUMN payment_template text NOT NULL DEFAULT 'Payment received: {owner} paid GHS {amount} for {land} ({year}). Receipt: {receipt}. Thank you.';
