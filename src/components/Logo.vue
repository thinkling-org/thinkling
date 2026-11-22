<template>
  <RouterLink to="/" class="logo" aria-label="Codenoms — strona główna">
    <svg aria-hidden="true" width="32" height="32" viewBox="0 0 48 48">
      <polygon points="24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5" fill="#7C5CFF" />
      <path d="M19 19l-5 5 5 5M29 19l5 5-5 5" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span>codenoms</span>
  </RouterLink>
</template>

<style scoped>
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
  text-decoration: none;
  font-weight: 900;
  font-size: 22px;
  letter-spacing: -0.01em;
}
.logo:hover {
  color: var(--text);
}
</style>
