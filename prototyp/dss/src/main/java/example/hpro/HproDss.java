package example.hpro;

import eu.europa.esig.dss.asic.cades.ASiCWithCAdESSignatureParameters;
import eu.europa.esig.dss.asic.cades.signature.ASiCWithCAdESService;
import eu.europa.esig.dss.asic.xades.ASiCWithXAdESSignatureParameters;
import eu.europa.esig.dss.asic.xades.signature.ASiCWithXAdESService;
import eu.europa.esig.dss.diagnostic.DiagnosticData;
import eu.europa.esig.dss.diagnostic.jaxb.XmlContainerInfo;
import eu.europa.esig.dss.diagnostic.jaxb.XmlManifestFile;
import eu.europa.esig.dss.detailedreport.DetailedReport;
import eu.europa.esig.dss.detailedreport.jaxb.XmlBasicBuildingBlocks;
import eu.europa.esig.dss.detailedreport.jaxb.XmlConstraint;
import eu.europa.esig.dss.enumerations.ASiCContainerType;
import eu.europa.esig.dss.enumerations.SignatureLevel;
import eu.europa.esig.dss.model.DSSDocument;
import eu.europa.esig.dss.model.FileDocument;
import eu.europa.esig.dss.model.InMemoryDocument;
import eu.europa.esig.dss.model.SignatureValue;
import eu.europa.esig.dss.model.ToBeSigned;
import eu.europa.esig.dss.model.x509.CertificateToken;
import eu.europa.esig.dss.simplereport.SimpleReport;
import eu.europa.esig.dss.spi.DSSUtils;
import eu.europa.esig.dss.spi.validation.CommonCertificateVerifier;
import eu.europa.esig.dss.spi.x509.CommonTrustedCertificateSource;
import eu.europa.esig.dss.token.DSSPrivateKeyEntry;
import eu.europa.esig.dss.token.Pkcs12SignatureToken;
import eu.europa.esig.dss.validation.SignedDocumentValidator;
import eu.europa.esig.dss.validation.reports.Reports;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

/**
 * Signatur- und Prüfwerkzeug für das Container-Experiment (EU DSS).
 *
 * <pre>
 * sign       IN OUT xades|cades P12 PASSWORT [MIME]   Datei IN signieren (DSS entscheidet: Umschlag
 *                                                     oder Erweiterung eines vorhandenen ASiC-Containers)
 * sign-files DIR OUT xades|cades P12 PASSWORT [MIME]  neuen ASiC-E-Container aus allen Dateien in DIR bauen
 * validate   DATEI TRUST.pem [POLICY.xml]             Signaturen prüfen, TRUST.pem als Vertrauensanker,
 *                                                     optional eigene Validierungsrichtlinie (sonst DSS-Standard)
 *
 * MIME setzt den Inhalt der mimetype-Datei (ASiCParameters.setMimeType), sonst DSS-Standard.
 * </pre>
 */
public class HproDss {

    public static void main(String[] args) throws Exception {
        if (args.length == 0) {
            System.err.println("Aufruf: sign | sign-files | validate (siehe Quelltext)");
            System.exit(2);
        }
        switch (args[0]) {
            case "sign" -> signDocs(List.of(new FileDocument(args[1])), args[2], args[3], args[4], args[5], opt(args, 6));
            case "sign-files" -> signFiles(Path.of(args[1]), args[2], args[3], args[4], args[5], opt(args, 6));
            case "validate" -> validate(args[1], args[2], opt(args, 3));
            default -> {
                System.err.println("Unbekannter Befehl: " + args[0]);
                System.exit(2);
            }
        }
    }

    static String opt(String[] args, int i) {
        return args.length > i ? args[i] : null;
    }

    static void signFiles(Path dir, String out, String format, String p12, String pw, String mime) throws Exception {
        List<DSSDocument> docs = new ArrayList<>();
        try (Stream<Path> s = Files.walk(dir)) {
            for (Path p : s.filter(Files::isRegularFile).sorted().toList()) {
                String name = dir.relativize(p).toString().replace(File.separatorChar, '/');
                docs.add(new InMemoryDocument(Files.readAllBytes(p), name));
            }
        }
        signDocs(docs, out, format, p12, pw, mime);
    }

    static void signDocs(List<DSSDocument> docs, String out, String format, String p12, String pw, String mime) throws Exception {
        try (Pkcs12SignatureToken token = new Pkcs12SignatureToken(p12, new KeyStore.PasswordProtection(pw.toCharArray()))) {
            DSSPrivateKeyEntry key = token.getKeys().get(0);
            DSSDocument signed;
            CommonCertificateVerifier cv = new CommonCertificateVerifier();
            if ("xades".equals(format)) {
                ASiCWithXAdESService service = new ASiCWithXAdESService(cv);
                ASiCWithXAdESSignatureParameters p = new ASiCWithXAdESSignatureParameters();
                p.setSignatureLevel(SignatureLevel.XAdES_BASELINE_B);
                p.aSiC().setContainerType(ASiCContainerType.ASiC_E);
                if (mime != null) p.aSiC().setMimeType(mime);
                p.setSigningCertificate(key.getCertificate());
                p.setCertificateChain(key.getCertificateChain());
                ToBeSigned tbs = docs.size() == 1 ? service.getDataToSign(docs.get(0), p) : service.getDataToSign(docs, p);
                SignatureValue sv = token.sign(tbs, p.getDigestAlgorithm(), key);
                signed = docs.size() == 1 ? service.signDocument(docs.get(0), p, sv) : service.signDocument(docs, p, sv);
            } else if ("cades".equals(format)) {
                ASiCWithCAdESService service = new ASiCWithCAdESService(cv);
                ASiCWithCAdESSignatureParameters p = new ASiCWithCAdESSignatureParameters();
                p.setSignatureLevel(SignatureLevel.CAdES_BASELINE_B);
                p.aSiC().setContainerType(ASiCContainerType.ASiC_E);
                if (mime != null) p.aSiC().setMimeType(mime);
                p.setSigningCertificate(key.getCertificate());
                p.setCertificateChain(key.getCertificateChain());
                ToBeSigned tbs = docs.size() == 1 ? service.getDataToSign(docs.get(0), p) : service.getDataToSign(docs, p);
                SignatureValue sv = token.sign(tbs, p.getDigestAlgorithm(), key);
                signed = docs.size() == 1 ? service.signDocument(docs.get(0), p, sv) : service.signDocument(docs, p, sv);
            } else {
                throw new IllegalArgumentException("Format muss xades oder cades sein: " + format);
            }
            signed.save(out);
            System.out.println("signiert: " + out + " (" + format + ", " + docs.size() + " Eingabedokument(e))");
        }
    }

    static void validate(String file, String trustPem, String policy) throws Exception {
        CertificateToken anchor = DSSUtils.loadCertificate(new File(trustPem));
        CommonTrustedCertificateSource trusted = new CommonTrustedCertificateSource();
        trusted.addCertificate(anchor);
        CommonCertificateVerifier cv = new CommonCertificateVerifier();
        cv.setTrustedCertSources(trusted);

        SignedDocumentValidator validator;
        try {
            validator = SignedDocumentValidator.fromDocument(new FileDocument(file));
        } catch (Exception e) {
            System.out.println("DSS: kein unterstütztes Signaturformat erkannt -> " + e.getClass().getSimpleName() + ": " + e.getMessage());
            return;
        }
        System.out.println("Validator: " + validator.getClass().getSimpleName());
        validator.setCertificateVerifier(cv);
        Reports reports = policy == null ? validator.validateDocument() : validator.validateDocument(new File(policy));
        System.out.println("Validierungsrichtlinie: " + (policy == null ? "DSS-Standard (policy/constraint.xml)" : policy));

        DiagnosticData dd = reports.getDiagnosticData();
        XmlContainerInfo ci = dd.getContainerInfo();
        if (ci != null) {
            System.out.println("Containertyp: " + ci.getContainerType());
            System.out.println("mimetype-Datei vorhanden: " + ci.isMimeTypeFilePresent());
            System.out.println("mimetype-Inhalt: " + ci.getMimeTypeContent());
            System.out.println("ZIP-Kommentar: " + ci.getZipComment());
            System.out.println("Inhaltsdateien laut DSS: " + ci.getContentFiles());
            if (ci.getManifestFiles() != null) {
                for (XmlManifestFile mf : ci.getManifestFiles()) {
                    System.out.println("Manifest " + mf.getFilename() + " -> Signatur " + mf.getSignatureFilename() + ", Einträge " + mf.getEntries());
                }
            }
        } else {
            System.out.println("Containerinfo: keine");
        }

        SimpleReport sr = reports.getSimpleReport();
        System.out.println("Anzahl Signaturen: " + sr.getSignaturesCount() + " (gültig: " + sr.getValidSignaturesCount() + ")");
        DetailedReport dr = reports.getDetailedReport();
        for (String id : sr.getSignatureIdList()) {
            System.out.println("--- Signatur " + id);
            System.out.println("Dateiname: " + dd.getSignatureById(id).getFilename());
            System.out.println("Format: " + sr.getSignatureFormat(id));
            System.out.println("Indication: " + sr.getIndication(id) + (sr.getSubIndication(id) != null ? " / " + sr.getSubIndication(id) : ""));
            System.out.println("Signierte Objekte: " + sr.getSignatureScopes(id).stream().map(s -> s.getName()).toList());
            for (var m : sr.getAdESValidationErrors(id)) System.out.println("FEHLER: " + m.getValue());
            for (var m : sr.getAdESValidationWarnings(id)) System.out.println("WARNUNG: " + m.getValue());
            for (var m : sr.getAdESValidationInfo(id)) System.out.println("INFO: " + m.getValue());
            XmlBasicBuildingBlocks bbb = dr.getBasicBuildingBlockById(id);
            if (bbb != null && bbb.getFC() != null) {
                System.out.println("Format-Prüfung (FC): " + bbb.getFC().getConclusion().getIndication());
                for (XmlConstraint c : bbb.getFC().getConstraint()) {
                    String msg = c.getName().getValue() + " -> " + c.getStatus();
                    if (c.getError() != null) msg += " [" + c.getError().getValue() + "]";
                    if (c.getWarning() != null) msg += " [" + c.getWarning().getValue() + "]";
                    System.out.println("  " + msg);
                }
            }
        }
    }
}
