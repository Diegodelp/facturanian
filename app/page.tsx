export default function Page() {
  return (
    <main style={{padding: 24}}>
      <h1>AFIP Invoice – WSFEv1</h1>
      <p>Endpoint: <code>POST /api/invoices</code></p>
      <p>Usa <code>@afipsdk/afip.js</code> y devuelve PDF con QR.</p>
    </main>
  );
}
