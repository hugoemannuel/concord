import { Linking, StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, spacing } from '../../../shared/theme/tokens'
import { TextLink } from '../../../shared/ui/TextLink'
import { PRIVACY_URL, TERMS_URL } from '../lib/legalLinks'

const open = (url: string) => () => void Linking.openURL(url).catch(() => {})

/** Os dois links lado a lado (alvo de toque de 44 dp cada). */
function Links() {
  return (
    <View style={styles.links}>
      <TextLink title="Termos de uso" onPress={open(TERMS_URL)} />
      <TextLink title="Política de privacidade" onPress={open(PRIVACY_URL)} />
    </View>
  )
}

/** Cadastro: o aceite dos termos e da política, com os links. */
export function SignupConsent() {
  return (
    <View>
      <Text style={styles.text}>Ao criar a conta você concorda com os Termos de uso e a Política de privacidade.</Text>
      <Links />
    </View>
  )
}

/** Configurações → Minha conta: onde ler os documentos. */
export function LegalFooter() {
  return <Links />
}

const styles = StyleSheet.create({
  text: { color: colors.textMuted, fontSize: fontSize.xs },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg }
})
