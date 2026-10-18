// Same-origin API; access credentials and database bindings stay server-side.
window.pulseData = async function pulseData(table, method = 'GET', payload = null, id = null) {
  const rows = [];
  let offset = 0;
  try {
    do {
      const path = `/api/data/${encodeURIComponent(table)}${id ? '/'+encodeURIComponent(id) : ''}`;
      const response = await fetch(path + (offset ? '?offset='+offset : ''), {
        method, credentials:'same-origin',
        ...(payload ? { headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) } : {}),
      });
      if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('Your session expired. Refresh and sign in again.');
      const result = await response.json();
      if (!response.ok) return { data:null,error:result.error || { message:'Request failed.' } };
      if (method !== 'GET') return { data:result.data,error:null };
      rows.push(...result.data);
      offset = result.nextOffset;
    } while (offset !== null);
    return { data:rows,error:null };
  } catch {
    return { data:null,error:{ message:'Unable to connect. Refresh the page and check your sign-in.' } };
  }
};
