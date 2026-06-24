-- EnableBanking returned its internal session UID as the account IBAN when
-- Commerzbank's PSD2 endpoint didn't expose it. Fix all affected rows to the
-- real Giro IBAN. UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (8-4-4-4-12).
UPDATE transactions
SET account_iban = 'DE25700400450230082000'
WHERE account_iban LIKE '________-____-____-____-____________';
