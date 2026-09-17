// Mock for @ultranos/ui-kit/utils/format
const formatDate = (date, locale) => {
  if (!date) return ''
  try {
    return new Date(date).toLocaleDateString(locale || 'en')
  } catch {
    return date
  }
}

module.exports = { formatDate }
